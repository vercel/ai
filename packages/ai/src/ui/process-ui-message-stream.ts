import { Schema, validateTypes } from '@ai-sdk/provider-utils';
import { UIMessageStreamPart } from '../ui-message-stream/ui-message-stream-parts';
import { mergeObjects } from '../util/merge-objects';
import { parsePartialJson } from '../util/parse-partial-json';
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

export type StreamingUIMessageState<MESSAGE_METADATA = unknown> = {
  message: UIMessage<MESSAGE_METADATA>;
  activeTextPart: TextUIPart | undefined;
  activeReasoningPart: ReasoningUIPart | undefined;
  partialToolCalls: Record<
    string,
    { text: string; step: number; index: number; toolName: string }
  >;
  step: number;
};

export function createStreamingUIMessageState<MESSAGE_METADATA = unknown>({
  lastMessage,
  newMessageId = 'no-id',
}: {
  lastMessage?: UIMessage<MESSAGE_METADATA>;
  newMessageId?: string;
} = {}): StreamingUIMessageState<MESSAGE_METADATA> {
  const isContinuation = lastMessage?.role === 'assistant';

  const step = isContinuation
    ? 1 + (extractMaxToolInvocationStep(getToolInvocations(lastMessage)) ?? 0)
    : 0;

  const message: UIMessage<MESSAGE_METADATA> = isContinuation
    ? structuredClone(lastMessage)
    : {
        id: newMessageId,
        metadata: {} as MESSAGE_METADATA,
        role: 'assistant',
        parts: [],
      };

  return {
    message,
    activeTextPart: undefined,
    activeReasoningPart: undefined,
    partialToolCalls: {},
    step,
  };
}

export function processUIMessageStream<MESSAGE_METADATA = unknown>({
  stream,
  onToolCall,
  messageMetadataSchema,
  runUpdateMessageJob,
}: {
  stream: ReadableStream<UIMessageStreamPart>;
  messageMetadataSchema?: Schema<MESSAGE_METADATA>;
  onToolCall?: UseChatOptions['onToolCall'];
  runUpdateMessageJob: (
    job: (options: {
      state: StreamingUIMessageState<MESSAGE_METADATA>;
      write: () => void;
    }) => Promise<void>,
  ) => Promise<void>;
}): ReadableStream<UIMessageStreamPart> {
  return stream.pipeThrough(
    new TransformStream<UIMessageStreamPart, UIMessageStreamPart>({
      async transform(chunk, controller) {
        await runUpdateMessageJob(async ({ state, write }) => {
          function updateToolInvocationPart(
            toolCallId: string,
            invocation: ToolInvocation,
          ) {
            const part = state.message.parts.find(
              part =>
                part.type === 'tool-invocation' &&
                part.toolInvocation.toolCallId === toolCallId,
            ) as ToolInvocationUIPart | undefined;

            if (part != null) {
              part.toolInvocation = invocation;
            } else {
              state.message.parts.push({
                type: 'tool-invocation',
                toolInvocation: invocation,
              });
            }
          }

          async function updateMessageMetadata(metadata: unknown) {
            if (metadata != null) {
              const mergedMetadata =
                state.message.metadata != null
                  ? mergeObjects(state.message.metadata, metadata)
                  : metadata;

              if (messageMetadataSchema != null) {
                await validateTypes({
                  value: mergedMetadata,
                  schema: messageMetadataSchema,
                });
              }

              state.message.metadata = mergedMetadata as MESSAGE_METADATA;
            }
          }

          const { type, value } = chunk;
          switch (type) {
            case 'text': {
              if (state.activeTextPart == null) {
                state.activeTextPart = {
                  type: 'text',
                  text: value,
                };
                state.message.parts.push(state.activeTextPart);
              } else {
                state.activeTextPart.text += value;
              }

              write();
              break;
            }

            case 'reasoning': {
              if (state.activeReasoningPart == null) {
                state.activeReasoningPart = {
                  type: 'reasoning',
                  text: value.text,
                  providerMetadata: value.providerMetadata,
                };
                state.message.parts.push(state.activeReasoningPart);
              } else {
                state.activeReasoningPart.text += value.text;
                state.activeReasoningPart.providerMetadata =
                  value.providerMetadata;
              }

              write();
              break;
            }

            case 'reasoning-part-finish': {
              if (state.activeReasoningPart != null) {
                state.activeReasoningPart = undefined;
              }
              break;
            }

            case 'file': {
              state.message.parts.push({
                type: 'file',
                mediaType: value.mediaType,
                url: value.url,
              });

              write();
              break;
            }

            case 'source': {
              state.message.parts.push({
                type: 'source',
                source: value,
              });

              write();
              break;
            }

            case 'tool-call-streaming-start': {
              const toolInvocations = getToolInvocations(state.message);

              // add the partial tool call to the map
              state.partialToolCalls[value.toolCallId] = {
                text: '',
                step: state.step,
                toolName: value.toolName,
                index: toolInvocations.length,
              };

              updateToolInvocationPart(value.toolCallId, {
                state: 'partial-call',
                step: state.step,
                toolCallId: value.toolCallId,
                toolName: value.toolName,
                args: undefined,
              } as const);

              write();
              break;
            }

            case 'tool-call-delta': {
              const partialToolCall = state.partialToolCalls[value.toolCallId];

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

              write();
              break;
            }

            case 'tool-call': {
              // workaround for Zod issue where unknown includes undefined
              const call = { args: value.args!, ...value };

              updateToolInvocationPart(value.toolCallId, {
                state: 'call',
                step: state.step,
                ...call,
              } as const);

              write();

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
                    step: state.step,
                    ...call,
                    result,
                  } as const);

                  write();
                }
              }
              break;
            }

            case 'tool-result': {
              const toolInvocations = getToolInvocations(state.message);

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

              write();
              break;
            }

            case 'start-step': {
              // add a step boundary part to the message
              state.message.parts.push({ type: 'step-start' });

              await updateMessageMetadata(value?.metadata);
              write();
              break;
            }

            case 'finish-step': {
              state.step += 1;

              // reset the current text and reasoning parts
              state.activeTextPart = undefined;
              state.activeReasoningPart = undefined;

              await updateMessageMetadata(value?.metadata);
              if (value?.metadata != null) {
                write();
              }
              break;
            }

            case 'start': {
              if (value?.messageId != null) {
                state.message.id = value.messageId;
              }

              await updateMessageMetadata(value?.metadata);

              if (value?.messageId != null || value?.metadata != null) {
                write();
              }
              break;
            }

            case 'finish': {
              await updateMessageMetadata(value?.metadata);
              if (value?.metadata != null) {
                write();
              }
              break;
            }

            case 'metadata': {
              await updateMessageMetadata(value.metadata);
              if (value.metadata != null) {
                write();
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
        });
      },
    }),
  );
}
