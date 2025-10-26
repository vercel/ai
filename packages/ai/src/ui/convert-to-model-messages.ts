import {
  AssistantContent,
  FilePart,
  isNonNullable,
  ModelMessage,
  TextPart,
  ToolApprovalResponse,
  ToolResultPart,
} from '@ai-sdk/provider-utils';
import { ToolSet } from '../generate-text/tool-set';
import { createToolModelOutput } from '../prompt/create-tool-model-output';
import { MessageConversionError } from '../prompt/message-conversion-error';
import {
  DataUIPart,
  DynamicToolUIPart,
  FileUIPart,
  getToolOrDynamicToolName,
  InferUIMessageData,
  InferUIMessageTools,
  isDataUIPart,
  isFileUIPart,
  isReasoningUIPart,
  isTextUIPart,
  isToolOrDynamicToolUIPart,
  ReasoningUIPart,
  TextUIPart,
  ToolUIPart,
  UIMessage,
} from './ui-messages';

/**
Converts an array of UI messages from useChat into an array of ModelMessages that can be used
with the AI functions (e.g. `streamText`, `generateText`).

@param messages - The UI messages to convert.
@param options.tools - The tools to use.
@param options.ignoreIncompleteToolCalls - Whether to ignore incomplete tool calls. Default is `false`.
@param options.convertDataPart - Optional function to convert data parts to text or file model message parts. Returns `undefined` if the part should be ignored.

@returns An array of ModelMessages.
 */
export function convertToModelMessages<UI_MESSAGE extends UIMessage>(
  messages: Array<Omit<UI_MESSAGE, 'id'>>,
  options?: {
    tools?: ToolSet;
    ignoreIncompleteToolCalls?: boolean;
    convertDataPart?: (
      part: DataUIPart<InferUIMessageData<UI_MESSAGE>>,
    ) => TextPart | FilePart | undefined;
  },
): ModelMessage[] {
  const modelMessages: ModelMessage[] = [];

  if (options?.ignoreIncompleteToolCalls) {
    messages = messages.map(message => ({
      ...message,
      parts: message.parts.filter(
        part =>
          !isToolOrDynamicToolUIPart(part) ||
          (part.state !== 'input-streaming' &&
            part.state !== 'input-available'),
      ),
    }));
  }

  for (const message of messages) {
    switch (message.role) {
      case 'system': {
        const textParts = message.parts.filter(
          (part): part is TextUIPart => part.type === 'text',
        );

        const providerMetadata = textParts.reduce((acc, part) => {
          if (part.providerMetadata != null) {
            return { ...acc, ...part.providerMetadata };
          }
          return acc;
        }, {});

        modelMessages.push({
          role: 'system',
          content: textParts.map(part => part.text).join(''),
          ...(Object.keys(providerMetadata).length > 0
            ? { providerOptions: providerMetadata }
            : {}),
        });
        break;
      }

      case 'user': {
        modelMessages.push({
          role: 'user',
          content: message.parts
            .map((part): TextPart | FilePart | undefined => {
              // Process text parts
              if (isTextUIPart(part)) {
                return {
                  type: 'text' as const,
                  text: part.text,
                  ...(part.providerMetadata != null
                    ? { providerOptions: part.providerMetadata }
                    : {}),
                };
              }

              // Process file parts
              if (isFileUIPart(part)) {
                return {
                  type: 'file' as const,
                  mediaType: part.mediaType,
                  filename: part.filename,
                  data: part.url,
                  ...(part.providerMetadata != null
                    ? { providerOptions: part.providerMetadata }
                    : {}),
                };
              }

              // Process data parts with converter if provided
              if (isDataUIPart(part)) {
                return options?.convertDataPart?.(
                  part as DataUIPart<InferUIMessageData<UI_MESSAGE>>,
                );
              }
            })
            .filter(isNonNullable),
        });

        break;
      }

      case 'assistant': {
        if (message.parts != null) {
          let block: Array<
            | TextUIPart
            | ToolUIPart<InferUIMessageTools<UI_MESSAGE>>
            | ReasoningUIPart
            | FileUIPart
            | DynamicToolUIPart
            | DataUIPart<InferUIMessageData<UI_MESSAGE>>
          > = [];

          function processBlock() {
            if (block.length === 0) {
              return;
            }

            const content: AssistantContent = [];

            for (const part of block) {
              if (isTextUIPart(part)) {
                content.push({
                  type: 'text' as const,
                  text: part.text,
                  ...(part.providerMetadata != null
                    ? { providerOptions: part.providerMetadata }
                    : {}),
                });
              } else if (isFileUIPart(part)) {
                content.push({
                  type: 'file' as const,
                  mediaType: part.mediaType,
                  filename: part.filename,
                  data: part.url,
                });
              } else if (isReasoningUIPart(part)) {
                content.push({
                  type: 'reasoning' as const,
                  text: part.text,
                  providerOptions: part.providerMetadata,
                });
              } else if (isToolOrDynamicToolUIPart(part)) {
                const toolName = getToolOrDynamicToolName(part);

                if (part.state !== 'input-streaming') {
                  content.push({
                    type: 'tool-call' as const,
                    toolCallId: part.toolCallId,
                    toolName,
                    input:
                      part.state === 'output-error'
                        ? (part.input ??
                          ('rawInput' in part ? part.rawInput : undefined))
                        : part.input,
                    providerExecuted: part.providerExecuted,
                    ...(part.callProviderMetadata != null
                      ? { providerOptions: part.callProviderMetadata }
                      : {}),
                  });

                  if (part.approval != null) {
                    content.push({
                      type: 'tool-approval-request' as const,
                      approvalId: part.approval.id,
                      toolCallId: part.toolCallId,
                    });
                  }

                  if (
                    part.providerExecuted === true &&
                    (part.state === 'output-available' ||
                      part.state === 'output-error')
                  ) {
                    content.push({
                      type: 'tool-result',
                      toolCallId: part.toolCallId,
                      toolName,
                      output: createToolModelOutput({
                        output:
                          part.state === 'output-error'
                            ? part.errorText
                            : part.output,
                        tool: options?.tools?.[toolName],
                        errorMode:
                          part.state === 'output-error' ? 'json' : 'none',
                      }),
                    });
                  }
                }
              } else if (isDataUIPart(part)) {
                const dataPart = options?.convertDataPart?.(
                  part as DataUIPart<InferUIMessageData<UI_MESSAGE>>,
                );

                if (dataPart != null) {
                  content.push(dataPart);
                }
              } else {
                const _exhaustiveCheck: never = part;
                throw new Error(`Unsupported part: ${_exhaustiveCheck}`);
              }
            }

            modelMessages.push({
              role: 'assistant',
              content,
            });

            // check if there are tool invocations with results in the block
            const toolParts = block.filter(
              part =>
                isToolOrDynamicToolUIPart(part) &&
                part.providerExecuted !== true,
            ) as (
              | ToolUIPart<InferUIMessageTools<UI_MESSAGE>>
              | DynamicToolUIPart
            )[];

            // tool message with tool results
            if (toolParts.length > 0) {
              modelMessages.push({
                role: 'tool',
                content: toolParts.flatMap(
                  (toolPart): Array<ToolResultPart | ToolApprovalResponse> => {
                    const outputs: Array<
                      ToolResultPart | ToolApprovalResponse
                    > = [];

                    // add approval response for approved tool calls:
                    if (toolPart.approval?.approved != null) {
                      outputs.push({
                        type: 'tool-approval-response' as const,
                        approvalId: toolPart.approval.id,
                        approved: toolPart.approval.approved,
                        reason: toolPart.approval.reason,
                      });
                    }

                    switch (toolPart.state) {
                      case 'output-denied': {
                        outputs.push({
                          type: 'tool-result',
                          toolCallId: toolPart.toolCallId,
                          toolName: getToolOrDynamicToolName(toolPart),
                          output: {
                            type: 'error-text' as const,
                            value:
                              toolPart.approval.reason ??
                              'Tool execution denied.',
                          },
                        });

                        break;
                      }

                      case 'output-error':
                      case 'output-available': {
                        const toolName = getToolOrDynamicToolName(toolPart);
                        outputs.push({
                          type: 'tool-result',
                          toolCallId: toolPart.toolCallId,
                          toolName,
                          output: createToolModelOutput({
                            output:
                              toolPart.state === 'output-error'
                                ? toolPart.errorText
                                : toolPart.output,
                            tool: options?.tools?.[toolName],
                            errorMode:
                              toolPart.state === 'output-error'
                                ? 'text'
                                : 'none',
                          }),
                        });
                        break;
                      }
                    }

                    return outputs;
                  },
                ),
              });
            }

            // updates for next block
            block = [];
          }

          for (const part of message.parts) {
            if (
              isTextUIPart(part) ||
              isReasoningUIPart(part) ||
              isFileUIPart(part) ||
              isToolOrDynamicToolUIPart(part) ||
              isDataUIPart(part)
            ) {
              block.push(part as (typeof block)[number]);
            } else if (part.type === 'step-start') {
              processBlock();
            }
          }

          processBlock();

          break;
        }

        break;
      }

      default: {
        const _exhaustiveCheck: never = message.role;
        throw new MessageConversionError({
          originalMessage: message,
          message: `Unsupported role: ${_exhaustiveCheck}`,
        });
      }
    }
  }

  return modelMessages;
}

/**
@deprecated Use `convertToModelMessages` instead.
 */
// TODO remove in AI SDK 6
export const convertToCoreMessages = convertToModelMessages;
