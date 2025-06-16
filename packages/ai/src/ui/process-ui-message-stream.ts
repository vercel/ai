import {
  StandardSchemaV1,
  ToolCall,
  validateTypes,
  Validator,
} from '@ai-sdk/provider-utils';
import {
  InferUIMessageStreamPart,
  isDataUIMessageStreamPart,
  UIMessageStreamPart,
} from '../ui-message-stream/ui-message-stream-parts';
import { mergeObjects } from '../util/merge-objects';
import { parsePartialJson } from '../util/parse-partial-json';
import {
  InferUIMessageData,
  InferUIMessageMetadata,
  InferUIMessageTools,
  ReasoningUIPart,
  isToolUIPart,
  TextUIPart,
  ToolUIPart,
  UIMessage,
  UIMessagePart,
  getToolName,
} from './ui-messages';
import { UIDataTypesToSchemas } from './chat';

export type StreamingUIMessageState<UI_MESSAGE extends UIMessage> = {
  message: UI_MESSAGE;
  activeTextPart: TextUIPart | undefined;
  activeReasoningPart: ReasoningUIPart | undefined;
  partialToolCalls: Record<
    string,
    { text: string; index: number; toolName: string }
  >;
};

export function createStreamingUIMessageState<UI_MESSAGE extends UIMessage>({
  lastMessage,
  messageId,
}: {
  lastMessage: UI_MESSAGE | undefined;
  messageId: string;
}): StreamingUIMessageState<UI_MESSAGE> {
  return {
    message:
      lastMessage?.role === 'assistant'
        ? lastMessage
        : ({
            id: messageId,
            metadata: undefined,
            role: 'assistant',
            parts: [] as UIMessagePart<
              InferUIMessageData<UI_MESSAGE>,
              InferUIMessageTools<UI_MESSAGE>
            >[],
          } as UI_MESSAGE),
    activeTextPart: undefined,
    activeReasoningPart: undefined,
    partialToolCalls: {},
  };
}

export function processUIMessageStream<UI_MESSAGE extends UIMessage>({
  stream,
  onToolCall,
  messageMetadataSchema,
  dataPartSchemas,
  runUpdateMessageJob,
}: {
  // input stream is not fully typed yet:
  stream: ReadableStream<UIMessageStreamPart>;
  messageMetadataSchema?:
    | Validator<InferUIMessageMetadata<UI_MESSAGE>>
    | StandardSchemaV1<InferUIMessageMetadata<UI_MESSAGE>>;
  dataPartSchemas?: UIDataTypesToSchemas<InferUIMessageData<UI_MESSAGE>>;
  onToolCall?: (options: {
    toolCall: ToolCall<string, unknown>;
  }) => void | Promise<unknown> | unknown;
  runUpdateMessageJob: (
    job: (options: {
      state: StreamingUIMessageState<UI_MESSAGE>;
      write: () => void;
    }) => Promise<void>,
  ) => Promise<void>;
}): ReadableStream<InferUIMessageStreamPart<UI_MESSAGE>> {
  return stream.pipeThrough(
    new TransformStream<
      UIMessageStreamPart,
      InferUIMessageStreamPart<UI_MESSAGE>
    >({
      async transform(part, controller) {
        await runUpdateMessageJob(async ({ state, write }) => {
          function updateToolInvocationPart(
            options: {
              toolName: keyof InferUIMessageTools<UI_MESSAGE> & string;
              toolCallId: string;
            } & (
              | { state: 'input-streaming'; input: unknown }
              | { state: 'input-available'; input: unknown }
              | { state: 'output-available'; input: unknown; output: unknown }
            ),
          ) {
            const part = state.message.parts.find(
              part =>
                isToolUIPart(part) && part.toolCallId === options.toolCallId,
            ) as ToolUIPart<InferUIMessageTools<UI_MESSAGE>> | undefined;

            if (part != null) {
              part.state = options.state;
              (part as any).input = (options as any).input;
              (part as any).output = (options as any).output;
            } else {
              state.message.parts.push({
                type: `tool-${options.toolName}`,
                toolCallId: options.toolCallId,
                state: options.state,
                input: (options as any).input,
                output: (options as any).output,
              } as ToolUIPart<InferUIMessageTools<UI_MESSAGE>>);
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

              state.message.metadata =
                mergedMetadata as InferUIMessageMetadata<UI_MESSAGE>;
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

            case 'source-document': {
              state.message.parts.push({
                type: 'source-document',
                sourceId: part.sourceId,
                mediaType: part.mediaType,
                title: part.title,
                filename: part.filename,
                providerMetadata: part.providerMetadata,
              });

              write();
              break;
            }

            case 'tool-input-start': {
              const toolInvocations = state.message.parts.filter(isToolUIPart);

              // add the partial tool call to the map
              state.partialToolCalls[part.toolCallId] = {
                text: '',
                toolName: part.toolName,
                index: toolInvocations.length,
              };

              updateToolInvocationPart({
                toolCallId: part.toolCallId,
                toolName: part.toolName,
                state: 'input-streaming',
                input: undefined,
              });

              write();
              break;
            }

            case 'tool-input-delta': {
              const partialToolCall = state.partialToolCalls[part.toolCallId];

              partialToolCall.text += part.inputTextDelta;

              const { value: partialArgs } = await parsePartialJson(
                partialToolCall.text,
              );

              updateToolInvocationPart({
                toolCallId: part.toolCallId,
                toolName: partialToolCall.toolName,
                state: 'input-streaming',
                input: partialArgs,
              });

              write();
              break;
            }

            case 'tool-input-available': {
              updateToolInvocationPart({
                toolCallId: part.toolCallId,
                toolName: part.toolName,
                state: 'input-available',
                input: part.input,
              });

              write();

              // invoke the onToolCall callback if it exists. This is blocking.
              // In the future we should make this non-blocking, which
              // requires additional state management for error handling etc.
              if (onToolCall) {
                const result = await onToolCall({
                  toolCall: part,
                });
                if (result != null) {
                  updateToolInvocationPart({
                    toolCallId: part.toolCallId,
                    toolName: part.toolName,
                    state: 'output-available',
                    input: part.input,
                    output: result,
                  });

                  write();
                }
              }
              break;
            }

            case 'tool-output-available': {
              const toolInvocations = state.message.parts.filter(isToolUIPart);

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

              const toolName = getToolName(
                toolInvocations[toolInvocationIndex],
              );

              updateToolInvocationPart({
                toolCallId: part.toolCallId,
                toolName,
                state: 'output-available',
                input: (toolInvocations[toolInvocationIndex] as any).input,
                output: part.output,
              });

              write();
              break;
            }

            case 'start-step': {
              // add a step boundary part to the message
              state.message.parts.push({ type: 'step-start' });
              break;
            }

            case 'finish-step': {
              // reset the current text and reasoning parts
              state.activeTextPart = undefined;
              state.activeReasoningPart = undefined;
              break;
            }

            case 'start': {
              if (part.messageId != null) {
                state.message.id = part.messageId;
              }

              await updateMessageMetadata(part.messageMetadata);

              if (part.messageId != null || part.messageMetadata != null) {
                write();
              }
              break;
            }

            case 'finish': {
              await updateMessageMetadata(part.messageMetadata);
              if (part.messageMetadata != null) {
                write();
              }
              break;
            }

            case 'message-metadata': {
              await updateMessageMetadata(part.messageMetadata);
              if (part.messageMetadata != null) {
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

          controller.enqueue(part as InferUIMessageStreamPart<UI_MESSAGE>);
        });
      },
    }),
  );
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null;
}
