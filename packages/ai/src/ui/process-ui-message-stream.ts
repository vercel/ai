import {
  StandardSchemaV1,
  ToolCall,
  validateTypes,
  Validator,
} from '@ai-sdk/provider-utils';
import {
  isDataUIMessageStreamPart,
  UIMessageStreamPart,
} from '../ui-message-stream/ui-message-stream-parts';
import { mergeObjects } from '../util/merge-objects';
import { parsePartialJson } from '../util/parse-partial-json';
import { getToolInvocations } from './get-tool-invocations';
import type {
  InferUIDataParts,
  ReasoningUIPart,
  TextUIPart,
  ToolInvocation,
  ToolInvocationUIPart,
  UIDataPartSchemas,
  UIMessage,
  UIMessagePart,
} from './ui-messages';

export type StreamingUIMessageState<
  MESSAGE_METADATA = unknown,
  UI_DATA_PART_SCHEMAS extends UIDataPartSchemas = UIDataPartSchemas,
> = {
  message: UIMessage<MESSAGE_METADATA, InferUIDataParts<UI_DATA_PART_SCHEMAS>>;
  activeTextPart: TextUIPart | undefined;
  activeReasoningPart: ReasoningUIPart | undefined;
  partialToolCalls: Record<
    string,
    { text: string; index: number; toolName: string }
  >;
};

export function createStreamingUIMessageState<
  MESSAGE_METADATA = unknown,
  UI_DATA_PART_SCHEMAS extends UIDataPartSchemas = UIDataPartSchemas,
>({
  lastMessage,
  newMessageId = '',
}: {
  lastMessage?: UIMessage<
    MESSAGE_METADATA,
    InferUIDataParts<UI_DATA_PART_SCHEMAS>
  >;
  newMessageId?: string;
} = {}): StreamingUIMessageState<MESSAGE_METADATA, UI_DATA_PART_SCHEMAS> {
  const isContinuation = lastMessage?.role === 'assistant';

  const message: UIMessage<
    MESSAGE_METADATA,
    InferUIDataParts<UI_DATA_PART_SCHEMAS>
  > = isContinuation
    ? lastMessage
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
  };
}

export function processUIMessageStream<
  MESSAGE_METADATA,
  UI_DATA_PART_SCHEMAS extends UIDataPartSchemas,
>({
  stream,
  onToolCall,
  messageMetadataSchema,
  dataPartSchemas,
  runUpdateMessageJob,
}: {
  stream: ReadableStream<UIMessageStreamPart>;
  messageMetadataSchema?:
    | Validator<MESSAGE_METADATA>
    | StandardSchemaV1<MESSAGE_METADATA>;
  dataPartSchemas?: UI_DATA_PART_SCHEMAS;
  onToolCall?: (options: {
    toolCall: ToolCall<string, unknown>;
  }) => void | Promise<unknown> | unknown;
  runUpdateMessageJob: (
    job: (options: {
      state: StreamingUIMessageState<
        NoInfer<MESSAGE_METADATA>,
        NoInfer<UI_DATA_PART_SCHEMAS>
      >;
      write: () => void;
    }) => Promise<void>,
  ) => Promise<void>;
}): ReadableStream<UIMessageStreamPart> {
  return stream.pipeThrough(
    new TransformStream<UIMessageStreamPart, UIMessageStreamPart>({
      async transform(part, controller) {
        await runUpdateMessageJob(async ({ state, write }) => {
          function updateToolInvocationPart(
            toolCallId: string,
            invocation: ToolInvocation,
          ) {
            const part = state.message.parts.find(
              part =>
                isToolInvocationUIPart(part) &&
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

          switch (part.type) {
            case 'text': {
              if (state.activeTextPart == null) {
                state.activeTextPart = {
                  type: 'text',
                  text: part.text,
                };
                state.message.parts.push(state.activeTextPart);
              } else {
                state.activeTextPart.text += part.text;
              }

              write();
              break;
            }

            case 'reasoning': {
              if (state.activeReasoningPart == null) {
                state.activeReasoningPart = {
                  type: 'reasoning',
                  text: part.text,
                  providerMetadata: part.providerMetadata,
                };
                state.message.parts.push(state.activeReasoningPart);
              } else {
                state.activeReasoningPart.text += part.text;
                state.activeReasoningPart.providerMetadata =
                  part.providerMetadata;
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
                mediaType: part.mediaType,
                url: part.url,
              });

              write();
              break;
            }

            case 'source-url': {
              state.message.parts.push({
                type: 'source-url',
                sourceId: part.sourceId,
                url: part.url,
                title: part.title,
                providerMetadata: part.providerMetadata,
              });

              write();
              break;
            }

            case 'tool-call-streaming-start': {
              const toolInvocations = getToolInvocations(state.message);

              // add the partial tool call to the map
              state.partialToolCalls[part.toolCallId] = {
                text: '',
                toolName: part.toolName,
                index: toolInvocations.length,
              };

              updateToolInvocationPart(part.toolCallId, {
                state: 'partial-call',
                toolCallId: part.toolCallId,
                toolName: part.toolName,
                args: undefined,
              } as const);

              write();
              break;
            }

            case 'tool-call-delta': {
              const partialToolCall = state.partialToolCalls[part.toolCallId];

              partialToolCall.text += part.argsTextDelta;

              const { value: partialArgs } = await parsePartialJson(
                partialToolCall.text,
              );

              updateToolInvocationPart(part.toolCallId, {
                state: 'partial-call',
                toolCallId: part.toolCallId,
                toolName: partialToolCall.toolName,
                args: partialArgs,
              } as const);

              write();
              break;
            }

            case 'tool-call': {
              updateToolInvocationPart(part.toolCallId, {
                state: 'call',
                toolCallId: part.toolCallId,
                toolName: part.toolName,
                args: part.args,
              } as const);

              write();

              // invoke the onToolCall callback if it exists. This is blocking.
              // In the future we should make this non-blocking, which
              // requires additional state management for error handling etc.
              if (onToolCall) {
                const result = await onToolCall({
                  toolCall: part,
                });
                if (result != null) {
                  updateToolInvocationPart(part.toolCallId, {
                    state: 'result',
                    toolCallId: part.toolCallId,
                    toolName: part.toolName,
                    args: part.args,
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
                invocation => invocation.toolCallId === part.toolCallId,
              );

              if (toolInvocationIndex === -1) {
                throw new Error(
                  'tool_result must be preceded by a tool_call with the same toolCallId',
                );
              }

              updateToolInvocationPart(part.toolCallId, {
                ...toolInvocations[toolInvocationIndex],
                state: 'result' as const,
                result: part.result,
              } as const);

              write();
              break;
            }

            case 'start-step': {
              // add a step boundary part to the message
              state.message.parts.push({ type: 'step-start' });

              await updateMessageMetadata(part.metadata);
              write();
              break;
            }

            case 'finish-step': {
              // reset the current text and reasoning parts
              state.activeTextPart = undefined;
              state.activeReasoningPart = undefined;

              await updateMessageMetadata(part.metadata);
              if (part.metadata != null) {
                write();
              }
              break;
            }

            case 'start': {
              if (part.messageId != null) {
                state.message.id = part.messageId;
              }

              await updateMessageMetadata(part.metadata);

              if (part.messageId != null || part.metadata != null) {
                write();
              }
              break;
            }

            case 'finish': {
              await updateMessageMetadata(part.metadata);
              if (part.metadata != null) {
                write();
              }
              break;
            }

            case 'metadata': {
              await updateMessageMetadata(part.metadata);
              if (part.metadata != null) {
                write();
              }
              break;
            }

            case 'error': {
              throw new Error(part.errorText);
            }

            default: {
              if (isDataUIMessageStreamPart(part)) {
                // TODO improve type safety
                const existingPart: any =
                  part.id != null
                    ? state.message.parts.find(
                        (partArg: any) =>
                          part.type === partArg.type && part.id === partArg.id,
                      )
                    : undefined;

                if (existingPart != null) {
                  // TODO improve type safety
                  existingPart.data =
                    isObject(existingPart.data) && isObject(part.data)
                      ? mergeObjects(existingPart.data, part.data)
                      : part.data;
                } else {
                  // TODO improve type safety
                  state.message.parts.push(part as any);
                }
                write();
              }
            }
          }

          controller.enqueue(part);
        });
      },
    }),
  );
}

// helper function to narrow the type of a UIMessagePart
function isToolInvocationUIPart(
  part: UIMessagePart<any>,
): part is ToolInvocationUIPart {
  return part.type === 'tool-invocation';
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null;
}
