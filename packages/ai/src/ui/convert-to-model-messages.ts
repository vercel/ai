import { ToolSet } from '../../core/generate-text/tool-set';
import { ToolResultPart } from '../../core/prompt/content-part';
import { AssistantContent, ModelMessage } from '../../core/prompt/message';
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
                content.push(part);
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
                  });
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
            const toolParts = block.filter(isToolUIPart);

            // tool message with tool results
            if (toolParts.length > 0) {
              modelMessages.push({
                role: 'tool',
                content: toolParts.map((toolPart): ToolResultPart => {
                  if (toolPart.state !== 'output-available') {
                    throw new MessageConversionError({
                      originalMessage: message,
                      message:
                        'ToolInvocation must have a result: ' +
                        JSON.stringify(toolPart),
                    });
                  }

                  const toolName = getToolName(toolPart);
                  const { toolCallId, output } = toolPart;

                  const tool = tools[toolName];
                  return tool?.experimental_toToolResultContent != null
                    ? {
                        type: 'tool-result',
                        toolCallId,
                        toolName,
                        output: tool.experimental_toToolResultContent(output),
                        experimental_content:
                          tool.experimental_toToolResultContent(output),
                      }
                    : {
                        type: 'tool-result',
                        toolCallId,
                        toolName,
                        output,
                      };
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
