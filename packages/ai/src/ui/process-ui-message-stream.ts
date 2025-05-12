import { Schema, validateTypes } from '@ai-sdk/provider-utils';
import { UIMessageStreamPart } from '../ui-message-stream/ui-message-stream-parts';
import { mergeObjects } from '../util/merge-objects';
import { parsePartialJson } from '../util/parse-partial-json';
import { getToolInvocations } from './get-tool-invocations';
import type {
  ReasoningUIPart,
  TextUIPart,
  ToolInvocation,
  ToolInvocationUIPart,
  UIMessage,
} from './ui-messages';
import { UseChatOptions } from './use-chat';
import { extractMaxToolInvocationStep } from './extract-max-tool-invocation-step';

export function processUIMessageStream<MESSAGE_METADATA = unknown>({
  stream,
  onToolCall,
  onFinish,
  messageMetadataSchema,
  acquireMessageLock,
}: {
  stream: ReadableStream<UIMessageStreamPart>;
  messageMetadataSchema?: Schema<MESSAGE_METADATA>;
  onToolCall?: UseChatOptions['onToolCall'];
  onFinish?: () => void;
  acquireMessageLock: () => Promise<{
    message: UIMessage<MESSAGE_METADATA>;
    currentTextPart: TextUIPart | undefined;
    setCurrentTextPart: (part: TextUIPart | undefined) => void;
    currentReasoningPart: ReasoningUIPart | undefined;
    setCurrentReasoningPart: (part: ReasoningUIPart | undefined) => void;
    partialToolCalls: Record<
      string,
      { text: string; step: number; index: number; toolName: string }
    >;
    writeMessage: () => Promise<void>;
    release: () => void;
  }>;
}): ReadableStream<UIMessageStreamPart> {
  return stream.pipeThrough(
    new TransformStream<UIMessageStreamPart, UIMessageStreamPart>({
      async transform(chunk, controller) {
        // get current state when chunk is being processed
        const {
          message,
          currentTextPart,
          setCurrentTextPart,
          currentReasoningPart,
          setCurrentReasoningPart,
          partialToolCalls,
          writeMessage,
          release,
        } = await acquireMessageLock();

        const isContinuation = message?.role === 'assistant';
        let step = isContinuation
          ? 1 + (extractMaxToolInvocationStep(getToolInvocations(message)) ?? 0)
          : 0;

        try {
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

          // affected, derived from last message
          // const isContinuation = lastMessage?.role === 'assistant';

          // affected
          // let step = isContinuation
          //   ? 1 +
          //     (extractMaxToolInvocationStep(getToolInvocations(lastMessage)) ?? 0)
          //   : 0;

          // // affected
          // const message: UIMessage<MESSAGE_METADATA> = isContinuation
          //   ? structuredClone(lastMessage)
          //   : {
          //       id: newMessageId,
          //       metadata: {} as MESSAGE_METADATA,
          //       role: 'assistant',
          //       parts: [],
          //     };

          // // affected
          // let currentTextPart: TextUIPart | undefined = undefined;

          // // affected
          // let currentReasoningPart: ReasoningUIPart | undefined = undefined;

          // // keep track of partial tool calls
          // // affected
          // const partialToolCalls: Record<
          //   string,
          //   { text: string; step: number; index: number; toolName: string }
          // > = {};

          const { type, value } = chunk;

          switch (type) {
            case 'text': {
              if (currentTextPart == null) {
                const newTextPart: TextUIPart = {
                  type: 'text',
                  text: value,
                };
                setCurrentTextPart(newTextPart);
                message.parts.push(newTextPart);
              } else {
                currentTextPart.text += value;
              }

              await writeMessage();
              break;
            }

            case 'reasoning': {
              if (currentReasoningPart == null) {
                const newReasoningPart: ReasoningUIPart = {
                  type: 'reasoning',
                  text: value.text,
                  providerMetadata: value.providerMetadata,
                };
                setCurrentReasoningPart(newReasoningPart);
                message.parts.push(newReasoningPart);
              } else {
                currentReasoningPart.text += value.text;
                currentReasoningPart.providerMetadata = value.providerMetadata;
              }

              await writeMessage();
              break;
            }

            case 'reasoning-part-finish': {
              if (currentReasoningPart != null) {
                setCurrentReasoningPart(undefined);
              }
              break;
            }

            case 'file': {
              message.parts.push({
                type: 'file',
                mediaType: value.mediaType,
                url: value.url,
              });

              await writeMessage();
              break;
            }

            case 'source': {
              message.parts.push({
                type: 'source',
                source: value,
              });

              writeMessage();
              break;
            }

            case 'tool-call-streaming-start': {
              const toolInvocations = getToolInvocations(message);

              // add the partial tool call to the map
              partialToolCalls[value.toolCallId] = {
                text: '',
                step,
                toolName: value.toolName,
                index: toolInvocations.length,
              };

              updateToolInvocationPart(value.toolCallId, {
                state: 'partial-call',
                step,
                toolCallId: value.toolCallId,
                toolName: value.toolName,
                args: undefined,
              } as const);

              writeMessage();
              break;
            }

            case 'tool-call-delta': {
              const partialToolCall = partialToolCalls[value.toolCallId];

              partialToolCall.text += value.argsTextDelta;

              const { value: partialArgs } = await parsePartialJson(
                partialToolCall.text,
              );

              updateToolInvocationPart(value.toolCallId, {
                state: 'partial-call',
                step: partialToolCall.step,
                toolCallId: value.toolCallId,
                toolName: partialToolCall.toolName,
                args: partialArgs,
              } as const);

              writeMessage();
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

              writeMessage();

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

                  writeMessage();
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

              writeMessage();
              break;
            }

            case 'start-step': {
              // add a step boundary part to the message
              message.parts.push({ type: 'step-start' });

              await updateMessageMetadata(value.metadata);
              writeMessage();
              break;
            }

            case 'finish-step': {
              step++;

              // reset the current text and reasoning parts
              setCurrentTextPart(undefined);
              setCurrentReasoningPart(undefined);

              await updateMessageMetadata(value.metadata);
              if (value.metadata != null) {
                writeMessage();
              }
              break;
            }

            case 'start': {
              if (value.messageId != null) {
                message.id = value.messageId;
              }

              await updateMessageMetadata(value.metadata);

              if (value.messageId != null || value.metadata != null) {
                writeMessage();
              }
              break;
            }

            case 'finish': {
              await updateMessageMetadata(value.metadata);
              if (value.metadata != null) {
                writeMessage();
              }
              break;
            }

            case 'metadata': {
              await updateMessageMetadata(value.metadata);
              if (value.metadata != null) {
                writeMessage();
              }
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
        onFinish?.();
      },
    }),
  );
}
