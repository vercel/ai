import { Schema, validateTypes } from '@ai-sdk/provider-utils';
import { UIMessageStreamPart } from '../ui-message-stream/ui-message-stream-parts';
import { mergeObjects } from '../util/merge-objects';
import { parsePartialJson } from '../util/parse-partial-json';
import { extractMaxToolInvocationStep } from './extract-max-tool-invocation-step';
import { getToolInvocations } from './get-tool-invocations';
import type {
  DataUIPart,
  ReasoningUIPart,
  TextUIPart,
  ToolInvocation,
  ToolInvocationUIPart,
  UIDataTypes,
  UIMessage,
} from './ui-messages';
import { UseChatOptions } from './use-chat';

export type StreamingUIMessageState<
  MESSAGE_METADATA = unknown,
  DATA_TYPES extends UIDataTypes = UIDataTypes,
> = {
  message: UIMessage<MESSAGE_METADATA, DATA_TYPES>;
  activeTextPart: TextUIPart | undefined;
  activeReasoningPart: ReasoningUIPart | undefined;
  partialToolCalls: Record<
    string,
    { text: string; step: number; index: number; toolName: string }
  >;
  step: number;
};

export function createStreamingUIMessageState<
  MESSAGE_METADATA = unknown,
  DATA_TYPES extends UIDataTypes = UIDataTypes,
>({
  lastMessage,
  newMessageId = 'no-id',
}: {
  lastMessage?: UIMessage<MESSAGE_METADATA, DATA_TYPES>;
  newMessageId?: string;
} = {}): StreamingUIMessageState<MESSAGE_METADATA, DATA_TYPES> {
  const isContinuation = lastMessage?.role === 'assistant';

  const step = isContinuation
    ? 1 + (extractMaxToolInvocationStep(getToolInvocations(lastMessage)) ?? 0)
    : 0;

  const message: UIMessage<MESSAGE_METADATA, DATA_TYPES> = isContinuation
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

export function processUIMessageStream<
  MESSAGE_METADATA = unknown,
  DATA_TYPES extends UIDataTypes = UIDataTypes,
>({
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

          switch (chunk.type) {
            case 'text': {
              if (state.activeTextPart == null) {
                state.activeTextPart = {
                  type: 'text',
                  text: chunk.value,
                };
                state.message.parts.push(state.activeTextPart);
              } else {
                state.activeTextPart.text += chunk.value;
              }

              write();
              break;
            }

            case 'reasoning': {
              if (state.activeReasoningPart == null) {
                state.activeReasoningPart = {
                  type: 'reasoning',
                  text: chunk.value.text,
                  providerMetadata: chunk.value.providerMetadata,
                };
                state.message.parts.push(state.activeReasoningPart);
              } else {
                state.activeReasoningPart.text += chunk.value.text;
                state.activeReasoningPart.providerMetadata =
                  chunk.value.providerMetadata;
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
                mediaType: chunk.value.mediaType,
                url: chunk.value.url,
              });

              write();
              break;
            }

            case 'source': {
              state.message.parts.push({
                type: 'source',
                source: {
                  sourceType: 'url' as const,
                  id: chunk.value.id,
                  url: chunk.value.url,
                  title: chunk.value.title,
                  providerMetadata: chunk.value.providerMetadata,
                },
              });

              write();
              break;
            }

            case 'tool-call-streaming-start': {
              const toolInvocations = getToolInvocations(state.message);

              // add the partial tool call to the map
              state.partialToolCalls[chunk.value.toolCallId] = {
                text: '',
                step: state.step,
                toolName: chunk.value.toolName,
                index: toolInvocations.length,
              };

              updateToolInvocationPart(chunk.value.toolCallId, {
                state: 'partial-call',
                step: state.step,
                toolCallId: chunk.value.toolCallId,
                toolName: chunk.value.toolName,
                args: undefined,
              } as const);

              write();
              break;
            }

            case 'tool-call-delta': {
              const partialToolCall =
                state.partialToolCalls[chunk.value.toolCallId];

              partialToolCall.text += chunk.value.argsTextDelta;

              const { value: partialArgs } = await parsePartialJson(
                partialToolCall.text,
              );

              updateToolInvocationPart(chunk.value.toolCallId, {
                state: 'partial-call',
                step: partialToolCall.step,
                toolCallId: chunk.value.toolCallId,
                toolName: partialToolCall.toolName,
                args: partialArgs,
              } as const);

              write();
              break;
            }

            case 'tool-call': {
              updateToolInvocationPart(chunk.value.toolCallId, {
                state: 'call',
                step: state.step,
                ...chunk.value,
              } as const);

              write();

              // invoke the onToolCall callback if it exists. This is blocking.
              // In the future we should make this non-blocking, which
              // requires additional state management for error handling etc.
              if (onToolCall) {
                const result = await onToolCall({
                  toolCall: chunk.value,
                });
                if (result != null) {
                  updateToolInvocationPart(chunk.value.toolCallId, {
                    state: 'result',
                    step: state.step,
                    ...chunk.value,
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
                invocation => invocation.toolCallId === chunk.value.toolCallId,
              );

              if (toolInvocationIndex === -1) {
                throw new Error(
                  'tool_result must be preceded by a tool_call with the same toolCallId',
                );
              }

              updateToolInvocationPart(chunk.value.toolCallId, {
                ...toolInvocations[toolInvocationIndex],
                state: 'result' as const,
                ...chunk.value,
              } as const);

              write();
              break;
            }

            case 'start-step': {
              // add a step boundary part to the message
              state.message.parts.push({ type: 'step-start' });

              await updateMessageMetadata(chunk.value?.metadata);
              write();
              break;
            }

            case 'finish-step': {
              state.step += 1;

              // reset the current text and reasoning parts
              state.activeTextPart = undefined;
              state.activeReasoningPart = undefined;

              await updateMessageMetadata(chunk.value?.metadata);
              if (chunk.value?.metadata != null) {
                write();
              }
              break;
            }

            case 'start': {
              if (chunk.value?.messageId != null) {
                state.message.id = chunk.value.messageId;
              }

              await updateMessageMetadata(chunk.value?.metadata);

              if (
                chunk.value?.messageId != null ||
                chunk.value?.metadata != null
              ) {
                write();
              }
              break;
            }

            case 'finish': {
              await updateMessageMetadata(chunk.value?.metadata);
              if (chunk.value?.metadata != null) {
                write();
              }
              break;
            }

            case 'metadata': {
              await updateMessageMetadata(chunk.value?.metadata);
              if (chunk.value?.metadata != null) {
                write();
              }
              break;
            }

            case 'error': {
              throw new Error(chunk.value);
            }

            default: {
              if (chunk.type.startsWith('data-')) {
                const existingPart =
                  chunk.id != null
                    ? state.message.parts.find(
                        part =>
                          part.type === chunk.type && part.id === chunk.id,
                      )
                    : undefined;

                if (existingPart != null) {
                  // TODO improve type safety
                  (existingPart as any).value = mergeObjects(
                    (existingPart as any).data,
                    chunk.data as any,
                  );
                } else {
                  // TODO improve type safety
                  state.message.parts.push({
                    type: chunk.type,
                    id: chunk.id,
                    value:
                      chunk.data as unknown as DATA_TYPES[keyof DATA_TYPES],
                  });
                }
                write();
              }
            }
          }

          controller.enqueue(chunk);
        });
      },
    }),
  );
}
