import { ToolSet } from '../generate-text/tool-set';
import {
  FileUIPart,
  ReasoningUIPart,
  TextUIPart,
  ToolInvocationUIPart,
  UIMessage,
} from '../types';
import { getUIText } from '../ui/get-ui-text';
import { ToolResultPart } from './content-part';
import { AssistantContent, ModelMessage } from './message';
import { MessageConversionError } from './message-conversion-error';

/**
Converts an array of messages from useChat into an array of CoreMessages that can be used
with the AI core functions (e.g. `streamText`).
 */
export function convertToModelMessages<TOOLS extends ToolSet = never>(
  messages: Array<Omit<UIMessage, 'id'>>,
  options?: { tools?: TOOLS },
): ModelMessage[] {
  const tools = options?.tools ?? ({} as TOOLS);
  const modelMessages: ModelMessage[] = [];

  for (const message of messages) {
    switch (message.role) {
      case 'system': {
        modelMessages.push({
          role: 'system',
          content: getUIText(message.parts),
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
            .map(part =>
              part.type === 'file'
                ? {
                    type: 'file' as const,
                    mediaType: part.mediaType,
                    filename: part.filename,
                    data: part.url,
                  }
                : part,
            ),
        });

        break;
      }

      case 'assistant': {
        if (message.parts != null) {
          let currentStep = 0;
          let blockHasToolInvocations = false;
          let block: Array<
            TextUIPart | ToolInvocationUIPart | ReasoningUIPart | FileUIPart
          > = [];

          function processBlock() {
            const content: AssistantContent = [];

            for (const part of block) {
              switch (part.type) {
                case 'text': {
                  content.push(part);
                  break;
                }
                case 'file': {
                  content.push({
                    type: 'file' as const,
                    mediaType: part.mediaType,
                    data: part.url,
                  });
                  break;
                }
                case 'reasoning': {
                  content.push({
                    type: 'reasoning' as const,
                    text: part.text,
                    providerOptions: part.providerMetadata,
                  });
                  break;
                }
                case 'tool-invocation':
                  content.push({
                    type: 'tool-call' as const,
                    toolCallId: part.toolInvocation.toolCallId,
                    toolName: part.toolInvocation.toolName,
                    args: part.toolInvocation.args,
                  });
                  break;
                default: {
                  const _exhaustiveCheck: never = part;
                  throw new Error(`Unsupported part: ${_exhaustiveCheck}`);
                }
              }
            }

            modelMessages.push({
              role: 'assistant',
              content,
            });

            // check if there are tool invocations with results in the block
            const stepInvocations = block
              .filter(
                (
                  part:
                    | TextUIPart
                    | ToolInvocationUIPart
                    | ReasoningUIPart
                    | FileUIPart,
                ): part is ToolInvocationUIPart =>
                  part.type === 'tool-invocation',
              )
              .map(part => part.toolInvocation);

            // tool message with tool results
            if (stepInvocations.length > 0) {
              modelMessages.push({
                role: 'tool',
                content: stepInvocations.map(
                  (toolInvocation): ToolResultPart => {
                    if (!('result' in toolInvocation)) {
                      throw new MessageConversionError({
                        originalMessage: message,
                        message:
                          'ToolInvocation must have a result: ' +
                          JSON.stringify(toolInvocation),
                      });
                    }

                    const { toolCallId, toolName, result } = toolInvocation;

                    const tool = tools[toolName];
                    return tool?.experimental_toToolResultContent != null
                      ? {
                          type: 'tool-result',
                          toolCallId,
                          toolName,
                          result: tool.experimental_toToolResultContent(result),
                          experimental_content:
                            tool.experimental_toToolResultContent(result),
                        }
                      : {
                          type: 'tool-result',
                          toolCallId,
                          toolName,
                          result,
                        };
                  },
                ),
              });
            }

            // updates for next block
            block = [];
            blockHasToolInvocations = false;
            currentStep++;
          }

          for (const part of message.parts) {
            switch (part.type) {
              case 'text': {
                if (blockHasToolInvocations) {
                  processBlock(); // text must come before tool invocations
                }
                block.push(part);
                break;
              }
              case 'file':
              case 'reasoning': {
                block.push(part);
                break;
              }
              case 'tool-invocation': {
                if ((part.toolInvocation.step ?? 0) !== currentStep) {
                  processBlock();
                }
                block.push(part);
                blockHasToolInvocations = true;
                break;
              }
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
