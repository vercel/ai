import {
  ReasoningUIPart,
  TextUIPart,
  ToolInvocationUIPart,
} from '@ai-sdk/ui-utils';
import { ToolSet } from '../generate-text/tool-set';
import {
  AssistantContent,
  CoreMessage,
  ToolCallPart,
  ToolResultPart,
} from '../prompt';
import { attachmentsToParts } from './attachments-to-parts';
import { MessageConversionError } from './message-conversion-error';
import { InternalUIMessage } from './ui-message';

/**
Converts an array of messages from useChat into an array of CoreMessages that can be used
with the AI core functions (e.g. `streamText`).
 */
export function convertToCoreMessages<TOOLS extends ToolSet = never>(
  messages: Array<InternalUIMessage>,
  options?: { tools?: TOOLS },
) {
  const tools = options?.tools ?? ({} as TOOLS);
  const coreMessages: CoreMessage[] = [];

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    const isLastMessage = i === messages.length - 1;
    const { role, content, experimental_attachments } = message;

    switch (role) {
      case 'system': {
        coreMessages.push({
          role: 'system',
          content,
        });
        break;
      }

      case 'user': {
        coreMessages.push({
          role: 'user',
          content: experimental_attachments
            ? [
                { type: 'text', text: content },
                ...attachmentsToParts(experimental_attachments),
              ]
            : content,
        });
        break;
      }

      case 'assistant': {
        if (message.parts != null) {
          let currentStep = 0;
          let blockHasToolInvocations = false;
          let block: Array<TextUIPart | ToolInvocationUIPart> = [];

          function processBlock() {
            coreMessages.push({
              role: 'assistant',
              content: block.map(part => {
                switch (part.type) {
                  case 'text':
                    return {
                      type: 'text' as const,
                      text: part.text,
                    };
                  default:
                    return {
                      type: 'tool-call' as const,
                      toolCallId: part.toolInvocation.toolCallId,
                      toolName: part.toolInvocation.toolName,
                      args: part.toolInvocation.args,
                    };
                }
              }),
            });

            // check if there are tool invocations with results in the block
            const stepInvocations = block
              .filter(
                (
                  part: TextUIPart | ToolInvocationUIPart,
                ): part is ToolInvocationUIPart =>
                  part.type === 'tool-invocation',
              )
              .map(part => part.toolInvocation);

            // tool message with tool results
            if (stepInvocations.length > 0) {
              coreMessages.push({
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
              case 'reasoning':
                // reasoning is not sent back to the LLM
                break;
              case 'text': {
                if (blockHasToolInvocations) {
                  processBlock(); // text must come before tool invocations
                }
                block.push(part);
                break;
              }
              case 'tool-invocation': {
                if (part.toolInvocation.step === currentStep) {
                  block.push(part);
                  blockHasToolInvocations = true;
                } else {
                  processBlock();
                }
                break;
              }
            }
          }

          processBlock();

          break;
        }

        const toolInvocations = message.toolInvocations;

        if (toolInvocations == null || toolInvocations.length === 0) {
          coreMessages.push({ role: 'assistant', content });
          break;
        }

        const maxStep = toolInvocations.reduce((max, toolInvocation) => {
          return Math.max(max, toolInvocation.step ?? 0);
        }, 0);

        for (let i = 0; i <= maxStep; i++) {
          const stepInvocations = toolInvocations.filter(
            toolInvocation => (toolInvocation.step ?? 0) === i,
          );

          if (stepInvocations.length === 0) {
            continue;
          }

          // assistant message with tool calls
          coreMessages.push({
            role: 'assistant',
            content: [
              ...(isLastMessage && content && i === 0
                ? [{ type: 'text' as const, text: content }]
                : []),
              ...stepInvocations.map(
                ({ toolCallId, toolName, args }): ToolCallPart => ({
                  type: 'tool-call' as const,
                  toolCallId,
                  toolName,
                  args,
                }),
              ),
            ],
          });

          // tool message with tool results
          coreMessages.push({
            role: 'tool',
            content: stepInvocations.map((toolInvocation): ToolResultPart => {
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
            }),
          });
        }

        if (content && !isLastMessage) {
          coreMessages.push({ role: 'assistant', content });
        }

        break;
      }

      case 'data': {
        // ignore
        break;
      }

      default: {
        const _exhaustiveCheck: never = role;
        throw new MessageConversionError({
          originalMessage: message,
          message: `Unsupported role: ${_exhaustiveCheck}`,
        });
      }
    }
  }

  return coreMessages;
}
