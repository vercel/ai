import {
  AssistantContent,
  FilePart,
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
  isDataUIPart,
  isToolOrDynamicToolUIPart,
  ReasoningUIPart,
  TextUIPart,
  ToolUIPart,
  UIDataTypes,
  UIMessage,
  UIMessagePart,
  UITools,
} from './ui-messages';

/**
 * Type guard to check if a message part is a text part.
 */
function isTextUIPart(
  part: UIMessagePart<UIDataTypes, UITools>,
): part is TextUIPart {
  return part.type === 'text';
}

/**
 * Type guard to check if a message part is a file part.
 */
function isFileUIPart(
  part: UIMessagePart<UIDataTypes, UITools>,
): part is FileUIPart {
  return part.type === 'file';
}

/**
 * Type guard to check if a message part is a reasoning part.
 */
function isReasoningUIPart(
  part: UIMessagePart<UIDataTypes, UITools>,
): part is ReasoningUIPart {
  return part.type === 'reasoning';
}

/**
Converts an array of UI messages from useChat into an array of ModelMessages that can be used
with the AI functions (e.g. `streamText`, `generateText`).

@param messages - The UI messages to convert.
@param options.tools - The tools to use.
@param options.ignoreIncompleteToolCalls - Whether to ignore incomplete tool calls. Default is `false`.
@param options.convertDataPart - Optional function to convert data parts to text or file parts for the model.

@returns An array of ModelMessages.
 */
export function convertToModelMessages<
  DATA_PARTS extends UIDataTypes = UIDataTypes,
  TOOLS extends UITools = UITools,
>(
  messages: Array<Omit<UIMessage<unknown, DATA_PARTS, TOOLS>, 'id'>>,
  options?: {
    tools?: ToolSet;
    ignoreIncompleteToolCalls?: boolean;
    convertDataPart?: (
      part: DataUIPart<DATA_PARTS>,
    ) => TextPart | FilePart | null;
  },
): ModelMessage[] {
  const modelMessages: ModelMessage[] = [];

  if (options?.ignoreIncompleteToolCalls) {
    messages = messages.map(message => ({
      ...message,
      parts: message.parts.filter(
        part =>
          !isToolOrDynamicToolUIPart<TOOLS>(part) ||
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
            .map((part): TextPart | FilePart | null => {
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
              if (isDataUIPart<DATA_PARTS>(part)) {  
                return options?.convertDataPart?.(part) ?? null;  
              }
            }),
        });

        break;
      }

      case 'assistant': {
        if (message.parts != null) {
          let block: Array<
            | TextUIPart
            | ToolUIPart<TOOLS>
            | ReasoningUIPart
            | FileUIPart
            | DynamicToolUIPart
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
              } else if (isToolOrDynamicToolUIPart<TOOLS>(part)) {
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
                isToolOrDynamicToolUIPart<TOOLS>(part) &&
                part.providerExecuted !== true,
            ) as (ToolUIPart<TOOLS> | DynamicToolUIPart)[];

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
              isToolOrDynamicToolUIPart<TOOLS>(part)
            ) {
              block.push(part);
            } else if (part.type === 'step-start') {
              processBlock();
            }
            // Skip data parts in assistant messages - they're not supported in model messages
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
