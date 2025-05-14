import { Schema, validateTypes } from '@ai-sdk/provider-utils';
import { UIMessageStreamPart } from '../ui-message-stream/ui-message-stream-parts';
import { Job } from '../util/job';
import { mergeObjects } from '../util/merge-objects';
import { extractMaxToolInvocationStep } from './extract-max-tool-invocation-step';
import { getToolInvocations } from './get-tool-invocations';
import type {
  ReasoningUIPart,
  TextUIPart,
  ToolInvocation,
  ToolInvocationUIPart,
  UIMessage,
} from './ui-messages';
import { UseChatOptions } from './use-chat';

export function processUIMessageStream<MESSAGE_METADATA = unknown>({
  stream,
  onUpdate,
  onToolCall,
  onFinish,
  onStart,
  // lastMessage,
  // newMessageId,
  messageMetadataSchema,
  acquireLock,
}: {
  stream: ReadableStream<UIMessageStreamPart>;
  lastMessage: UIMessage<MESSAGE_METADATA> | undefined;
  messageMetadataSchema?: Schema<MESSAGE_METADATA>;
  newMessageId: string;
  onToolCall?: UseChatOptions['onToolCall'];
  onUpdate?: (options: { message: UIMessage<MESSAGE_METADATA> }) => void;
  onStart?: () => void;
  onFinish?: (options: { message: UIMessage<MESSAGE_METADATA> }) => void;
  // temp: undefined
  acquireLock?: () => {
    write: (job: Job) => Promise<void>;
    release: () => void;
    activeResponse: {
      message: UIMessage<MESSAGE_METADATA>;
      currentTextPart?: TextUIPart;
      setCurrentTextPart: (currentTextPart?: TextUIPart) => void;
      currentReasoningPart?: ReasoningUIPart;
      setCurrentReasoningPart: (currentReasoningPart?: ReasoningUIPart) => void;
      toolCalls?: Record<string, { textArgs: string; toolName: string }>;
    };
  };
}): ReadableStream<UIMessageStreamPart> {
  return stream.pipeThrough(
    new TransformStream<UIMessageStreamPart, UIMessageStreamPart>({
      async transform(chunk, controller) {
        const { type, value } = chunk;

        // testing change: backwards compatible with old code
        if (!acquireLock) {
          return;
        }

        const {
          activeResponse: {
            message,
            currentTextPart,
            setCurrentTextPart,
            currentReasoningPart,
            setCurrentReasoningPart,
            toolCalls,
          },
          write,
          release,
        } = acquireLock();

        const isContinuation = message?.role === 'assistant';
        let step = isContinuation
          ? 1 + (extractMaxToolInvocationStep(getToolInvocations(message)) ?? 0)
          : 0;

        function updateToolInvocationPart(
          toolCallId: string,
          invocation: ToolInvocation,
        ) {
          const part = message.parts.find(
            part =>
              part.type === 'tool-invocation' &&
              part.toolInvocation.toolCallId === toolCallId,
          ) as ToolInvocationUIPart | undefined;

          if (part != null) {
            part.toolInvocation = invocation;
          } else {
            message.parts.push({
              type: 'tool-invocation',
              toolInvocation: invocation,
            });
          }
        }

        async function updateMessageMetadata(metadata: unknown) {
          if (metadata != null) {
            const mergedMetadata =
              message.metadata != null
                ? mergeObjects(message.metadata, metadata)
                : metadata;

            if (messageMetadataSchema != null) {
              await validateTypes({
                value: mergedMetadata,
                schema: messageMetadataSchema,
              });
            }

            message.metadata = mergedMetadata as MESSAGE_METADATA;
          }
        }

        try {
          switch (type) {
            case 'text': {
              const job = async () => {
                if (currentTextPart == null) {
                  const newTextPart: TextUIPart = {
                    type: 'text',
                    text: value,
                  };
                  setCurrentTextPart(newTextPart);
                  message.parts.push(newTextPart);
                } else {
                  currentTextPart.text += value;
                  setCurrentTextPart(currentTextPart);
                }

                onUpdate?.({ message });
              };
              await write(job);
              break;
            }

            case 'reasoning': {
              // if (currentReasoningPart == null) {
              //   currentReasoningPart = {
              //     type: 'reasoning',
              //     text: value.text,
              //     providerMetadata: value.providerMetadata,
              //   };
              //   message.parts.push(currentReasoningPart);
              // } else {
              //   currentReasoningPart.text += value.text;
              //   currentReasoningPart.providerMetadata = value.providerMetadata;
              // }

              onUpdate?.({ message });
              break;
            }

            case 'reasoning-part-finish': {
              // if (currentReasoningPart != null) {
              //   currentReasoningPart = undefined;
              // }
              break;
            }

            case 'file': {
              message.parts.push({
                type: 'file',
                mediaType: value.mediaType,
                url: value.url,
              });

              onUpdate?.({ message });
              break;
            }

            case 'source': {
              message.parts.push({
                type: 'source',
                source: value,
              });

              onUpdate?.({ message });
              break;
            }

            case 'tool-call-streaming-start': {
              const toolInvocations = getToolInvocations(message);

              // add the partial tool call to the map
              // partialToolCalls[value.toolCallId] = {
              //   text: '',
              //   step,
              //   toolName: value.toolName,
              //   index: toolInvocations.length,
              // };

              updateToolInvocationPart(value.toolCallId, {
                state: 'partial-call',
                step,
                toolCallId: value.toolCallId,
                toolName: value.toolName,
                args: undefined,
              } as const);

              onUpdate?.({ message });
              break;
            }

            case 'tool-call-delta': {
              // const partialToolCall = partialToolCalls[value.toolCallId];

              // partialToolCall.text += value.argsTextDelta;

              // const { value: partialArgs } = await parsePartialJson(
              //   partialToolCall.text,
              // );

              // updateToolInvocationPart(value.toolCallId, {
              //   state: 'partial-call',
              //   step: partialToolCall.step,
              //   toolCallId: value.toolCallId,
              //   toolName: partialToolCall.toolName,
              //   args: partialArgs,
              // } as const);

              onUpdate?.({ message });
              break;
            }

            case 'tool-call': {
              // workaround for Zod issue where unknown includes undefined
              const call = { args: value.args!, ...value };

              updateToolInvocationPart(value.toolCallId, {
                state: 'call',
                step,
                ...call,
              } as const);

              onUpdate?.({ message });

              // invoke the onToolCall callback if it exists. This is blocking.
              // In the future we should make this non-blocking, which
              // requires additional state management for error handling etc.
              if (onToolCall) {
                const result = await onToolCall({
                  toolCall: call,
                });
                if (result != null) {
                  updateToolInvocationPart(value.toolCallId, {
                    state: 'result',
                    step,
                    ...call,
                    result,
                  } as const);

                  onUpdate?.({ message });
                }
              }
              break;
            }

            case 'tool-result': {
              const toolInvocations = getToolInvocations(message);

              if (toolInvocations == null) {
                throw new Error('tool_result must be preceded by a tool_call');
              }

              // find if there is any tool invocation with the same toolCallId
              // and replace it with the result
              const toolInvocationIndex = toolInvocations.findIndex(
                invocation => invocation.toolCallId === value.toolCallId,
              );

              if (toolInvocationIndex === -1) {
                throw new Error(
                  'tool_result must be preceded by a tool_call with the same toolCallId',
                );
              }

              // workaround for Zod issue where unknown includes undefined
              const result = { result: value.result!, ...value };

              updateToolInvocationPart(value.toolCallId, {
                ...toolInvocations[toolInvocationIndex],
                state: 'result' as const,
                ...result,
              } as const);

              onUpdate?.({ message });
              break;
            }

            case 'start-step': {
              // add a step boundary part to the message
              const job = async () => {
                message.parts.push({ type: 'step-start' });
                onUpdate?.({ message });
                await updateMessageMetadata(value.metadata);
              };
              await write(job);
              break;
            }

            case 'finish-step': {
              const job = async () => {
                step += 1;

                // reset the current text and reasoning parts
                setCurrentTextPart(undefined);
                setCurrentReasoningPart(undefined);

                await updateMessageMetadata(value.metadata);
                if (value.metadata != null) {
                  onUpdate?.({ message });
                }
              };
              await write(job);
              break;
            }

            case 'start': {
              onStart?.();

              const job = async () => {
                if (value.messageId != null) {
                  message.id = value.messageId;
                }

                if (value.messageId != null || value.metadata != null) {
                  onUpdate?.({ message });
                }

                await updateMessageMetadata(value.metadata);
              };

              await write(job);
              break;
            }

            case 'finish': {
              const job = async () => {
                await updateMessageMetadata(value.metadata);
                if (value.metadata != null) {
                  onUpdate?.({ message });
                }
              };
              await write(job);
              break;
            }

            case 'metadata': {
              const job = async () => {
                await updateMessageMetadata(value.metadata);
                if (value.metadata != null) {
                  onUpdate?.({ message });
                }
              };
              await write(job);
              break;
            }

            case 'error': {
              throw new Error(value);
            }

            default: {
              const _exhaustiveCheck: never = type;
              throw new Error(`Unhandled stream part: ${_exhaustiveCheck}`);
            }
          }

          controller.enqueue(chunk);
        } finally {
          release();
        }
      },

      flush() {
        // onFinish?.({ message });
      },
    }),
  );
}
