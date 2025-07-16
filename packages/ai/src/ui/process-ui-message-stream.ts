import {
  StandardSchemaV1,
  ToolCall,
  validateTypes,
  Validator,
} from '@ai-sdk/provider-utils';
import {
  InferUIMessageChunk,
  DataUIMessageChunk,
  isDataUIMessageChunk,
  UIMessageChunk,
} from '../ui-message-stream/ui-message-chunks';
import { ErrorHandler } from '../util/error-handler';
import { mergeObjects } from '../util/merge-objects';
import { parsePartialJson } from '../util/parse-partial-json';
import { UIDataTypesToSchemas } from './chat';
import {
  DataUIPart,
  getToolName,
  InferUIMessageData,
  InferUIMessageMetadata,
  InferUIMessageTools,
  isToolUIPart,
  ReasoningUIPart,
  TextUIPart,
  ToolUIPart,
  UIMessage,
  UIMessagePart,
} from './ui-messages';
import { ProviderMetadata } from '../types';

export type StreamingUIMessageState<UI_MESSAGE extends UIMessage> = {
  message: UI_MESSAGE;
  activeTextParts: Record<string, TextUIPart>;
  activeReasoningParts: Record<string, ReasoningUIPart>;
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
    activeTextParts: {},
    activeReasoningParts: {},
    partialToolCalls: {},
  };
}

export function processUIMessageStream<UI_MESSAGE extends UIMessage>({
  stream,
  onToolCall,
  messageMetadataSchema,
  dataPartSchemas,
  runUpdateMessageJob,
  onError,
  onData,
}: {
  // input stream is not fully typed yet:
  stream: ReadableStream<UIMessageChunk>;
  messageMetadataSchema?:
    | Validator<InferUIMessageMetadata<UI_MESSAGE>>
    | StandardSchemaV1<InferUIMessageMetadata<UI_MESSAGE>>;
  dataPartSchemas?: UIDataTypesToSchemas<InferUIMessageData<UI_MESSAGE>>;
  onToolCall?: (options: {
    toolCall: ToolCall<string, unknown>;
  }) => void | Promise<unknown> | unknown;
  onData?: (dataPart: DataUIPart<InferUIMessageData<UI_MESSAGE>>) => void;
  runUpdateMessageJob: (
    job: (options: {
      state: StreamingUIMessageState<UI_MESSAGE>;
      write: () => void;
    }) => Promise<void>,
  ) => Promise<void>;
  onError: ErrorHandler;
}): ReadableStream<InferUIMessageChunk<UI_MESSAGE>> {
  return stream.pipeThrough(
    new TransformStream<UIMessageChunk, InferUIMessageChunk<UI_MESSAGE>>({
      async transform(part, controller) {
        await runUpdateMessageJob(async ({ state, write }) => {
          function updateToolInvocationPart(
            options: {
              toolName: keyof InferUIMessageTools<UI_MESSAGE> & string;
              toolCallId: string;
              providerExecuted?: boolean;
            } & (
              | {
                  state: 'input-streaming';
                  input: unknown;
                  providerExecuted?: boolean;
                }
              | {
                  state: 'input-available';
                  input: unknown;
                  providerExecuted?: boolean;
                  providerMetadata?: ProviderMetadata;
                }
              | {
                  state: 'output-available';
                  input: unknown;
                  output: unknown;
                  providerExecuted?: boolean;
                }
              | {
                  state: 'output-error';
                  input: unknown;
                  errorText: string;
                  providerExecuted?: boolean;
                }
            ),
          ) {
            const part = state.message.parts.find(
              part =>
                isToolUIPart(part) && part.toolCallId === options.toolCallId,
            ) as ToolUIPart<InferUIMessageTools<UI_MESSAGE>> | undefined;

            const anyOptions = options as any;
            const anyPart = part as any;

            if (part != null) {
              part.state = options.state;
              anyPart.input = anyOptions.input;
              anyPart.output = anyOptions.output;
              anyPart.errorText = anyOptions.errorText;

              // once providerExecuted is set, it stays for streaming
              anyPart.providerExecuted =
                anyOptions.providerExecuted ?? part.providerExecuted;

              if (
                anyOptions.providerMetadata != null &&
                part.state === 'input-available'
              ) {
                part.callProviderMetadata = anyOptions.providerMetadata;
              }
            } else {
              state.message.parts.push({
                type: `tool-${options.toolName}`,
                toolCallId: options.toolCallId,
                state: options.state,
                input: anyOptions.input,
                output: anyOptions.output,
                errorText: anyOptions.errorText,
                providerExecuted: anyOptions.providerExecuted,
                ...(anyOptions.providerMetadata != null
                  ? { callProviderMetadata: anyOptions.providerMetadata }
                  : {}),
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
            case 'text-start': {
              const textPart: TextUIPart = {
                type: 'text',
                text: '',
                providerMetadata: part.providerMetadata,
                state: 'streaming',
              };
              state.activeTextParts[part.id] = textPart;
              state.message.parts.push(textPart);
              write();
              break;
            }

            case 'text-delta': {
              const textPart = state.activeTextParts[part.id];
              textPart.text += part.delta;
              textPart.providerMetadata =
                part.providerMetadata ?? textPart.providerMetadata;
              write();
              break;
            }

            case 'text-end': {
              const textPart = state.activeTextParts[part.id];
              textPart.state = 'done';
              textPart.providerMetadata =
                part.providerMetadata ?? textPart.providerMetadata;
              delete state.activeTextParts[part.id];
              write();
              break;
            }

            case 'reasoning-start': {
              const reasoningPart: ReasoningUIPart = {
                type: 'reasoning',
                text: '',
                providerMetadata: part.providerMetadata,
                state: 'streaming',
              };
              state.activeReasoningParts[part.id] = reasoningPart;
              state.message.parts.push(reasoningPart);
              write();
              break;
            }

            case 'reasoning-delta': {
              const reasoningPart = state.activeReasoningParts[part.id];
              reasoningPart.text += part.delta;
              reasoningPart.providerMetadata =
                part.providerMetadata ?? reasoningPart.providerMetadata;
              write();
              break;
            }

            case 'reasoning-end': {
              const reasoningPart = state.activeReasoningParts[part.id];
              reasoningPart.providerMetadata =
                part.providerMetadata ?? reasoningPart.providerMetadata;
              reasoningPart.state = 'done';
              delete state.activeReasoningParts[part.id];

              write();
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
                providerExecuted: part.providerExecuted,
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
                providerExecuted: part.providerExecuted,
                providerMetadata: part.providerMetadata,
              });

              write();

              // invoke the onToolCall callback if it exists. This is blocking.
              // In the future we should make this non-blocking, which
              // requires additional state management for error handling etc.
              // Skip calling onToolCall for provider-executed tools since they are already executed
              if (onToolCall && !part.providerExecuted) {
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
                providerExecuted: part.providerExecuted,
              });

              write();
              break;
            }

            case 'tool-output-error': {
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
                state: 'output-error',
                input: (toolInvocations[toolInvocationIndex] as any).input,
                errorText: part.errorText,
                providerExecuted: part.providerExecuted,
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
              state.activeTextParts = {};
              state.activeReasoningParts = {};
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
              onError?.(new Error(part.errorText));
              break;
            }

            default: {
              if (isDataUIMessageChunk(part)) {
                // TODO validate against dataPartSchemas
                const dataPart = part as DataUIMessageChunk<
                  InferUIMessageData<UI_MESSAGE>
                >;

                // transient parts are not added to the message state
                if (dataPart.transient) {
                  onData?.(dataPart);
                  break;
                }

                // TODO improve type safety
                const existingPart: any =
                  dataPart.id != null
                    ? state.message.parts.find(
                        (partArg: any) =>
                          dataPart.type === partArg.type &&
                          dataPart.id === partArg.id,
                      )
                    : undefined;

                if (existingPart != null) {
                  // TODO validate merged data against dataPartSchemas
                  existingPart.data =
                    isObject(existingPart.data) && isObject(dataPart.data)
                      ? mergeObjects(existingPart.data, dataPart.data)
                      : dataPart.data;
                } else {
                  state.message.parts.push(dataPart);
                }

                onData?.(dataPart);

                write();
              }
            }
          }

          controller.enqueue(part as InferUIMessageChunk<UI_MESSAGE>);
        });
      },
    }),
  );
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null;
}
