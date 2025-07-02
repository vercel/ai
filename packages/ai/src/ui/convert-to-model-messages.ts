import {
  AssistantContent,
  ModelMessage,
  ToolResultPart,
} from '@ai-sdk/provider-utils';
import { ToolSet } from '../../core/generate-text/tool-set';
import { createToolModelOutput } from '../../core/prompt/create-tool-model-output';
import { MessageConversionError } from '../../core/prompt/message-conversion-error';
import {
  FileUIPart,
  getToolName,
  isToolUIPart,
  ReasoningUIPart,
  TextUIPart,
  ToolUIPart,
  UIMessage,
  UITools,
} from './ui-messages';

/**
Converts an array of messages from useChat into an array of CoreMessages that can be used
with the AI core functions (e.g. `streamText`).
 */
export function convertToModelMessages(
  messages: Array<Omit<UIMessage, 'id'>>,
  options?: { tools?: ToolSet },
): ModelMessage[] {
  const modelMessages: ModelMessage[] = [];

  for (const message of messages) {
    switch (message.role) {
      case 'system': {
        modelMessages.push({
          role: 'system',
          content: message.parts
            .map(part => (part.type === 'text' ? part.text : ''))
            .join(''),
        });
        break;
      }

      case 'user': {
        modelMessages.push({
          role: 'user',
          content: message.parts
            .filter(
              (part): part is TextUIPart | FileUIPart =>
                part.type === 'text' || part.type === 'file',
            )
            .map(part => {
              switch (part.type) {
                case 'text':
                  return {
                    type: 'text' as const,
                    text: part.text,
                  };
                case 'file':
                  return {
                    type: 'file' as const,
                    mediaType: part.mediaType,
                    filename: part.filename,
                    data: part.url,
                  };
                default:
                  return part;
              }
            }),
        });

        break;
      }

      case 'assistant': {
        if (message.parts != null) {
          let block: Array<
            TextUIPart | ToolUIPart<UITools> | ReasoningUIPart | FileUIPart
          > = [];

          function processBlock() {
            if (block.length === 0) {
              return;
            }

            const content: AssistantContent = [];

            for (const part of block) {
              if (part.type === 'text') {
                content.push({
                  type: 'text' as const,
                  text: part.text,
                });
              } else if (part.type === 'file') {
                content.push({
                  type: 'file' as const,
                  mediaType: part.mediaType,
                  data: part.url,
                });
              } else if (part.type === 'reasoning') {
                content.push({
                  type: 'reasoning' as const,
                  text: part.text,
                  providerOptions: part.providerMetadata,
                });
              } else if (isToolUIPart(part)) {
                const toolName = getToolName(part);

                if (part.state === 'input-streaming') {
                  throw new MessageConversionError({
                    originalMessage: message,
                    message: `incomplete tool input is not supported: ${part.toolCallId}`,
                  });
                } else {
                  content.push({
                    type: 'tool-call' as const,
                    toolCallId: part.toolCallId,
                    toolName,
                    input: part.input,
                    providerExecuted: part.providerExecuted,
                  });

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
            const toolParts = block
              .filter(isToolUIPart)
              .filter(part => part.providerExecuted !== true);

            // tool message with tool results
            if (toolParts.length > 0) {
              modelMessages.push({
                role: 'tool',
                content: toolParts.map((toolPart): ToolResultPart => {
                  switch (toolPart.state) {
                    case 'output-error':
                    case 'output-available': {
                      const toolName = getToolName(toolPart);

                      return {
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
                            toolPart.state === 'output-error' ? 'text' : 'none',
                        }),
                      };
                    }

                    default: {
                      throw new MessageConversionError({
                        originalMessage: message,
                        message: `Unsupported tool part state: ${toolPart.state}`,
                      });
                    }
                  }
                }),
              });
            }

            // updates for next block
            block = [];
          }

          for (const part of message.parts) {
            if (
              part.type === 'text' ||
              part.type === 'reasoning' ||
              part.type === 'file' ||
              isToolUIPart(part)
            ) {
              block.push(part);
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
