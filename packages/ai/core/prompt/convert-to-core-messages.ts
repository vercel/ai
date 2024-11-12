import { CoreMessage, ToolCallPart, ToolResultPart } from '../prompt';
import { CoreTool } from '../tool/tool';
import { attachmentsToParts } from './attachments-to-parts';
import { MessageConversionError } from './message-conversion-error';
import { UIMessage } from './ui-message';

/**
Converts an array of messages from useChat into an array of CoreMessages that can be used
with the AI core functions (e.g. `streamText`).
 */
export function convertToCoreMessages<
  TOOLS extends Record<string, CoreTool> = never,
>(messages: Array<UIMessage>, options?: { tools?: TOOLS }) {
  const tools = options?.tools ?? ({} as TOOLS);
  const coreMessages: CoreMessage[] = [];

  for (const message of messages) {
    const { role, content, toolInvocations, experimental_attachments } =
      message;

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
        if (toolInvocations == null) {
          coreMessages.push({ role: 'assistant', content });
          break;
        }

        // assistant message with tool calls
        coreMessages.push({
          role: 'assistant',
          content: [
            { type: 'text', text: content },
            ...toolInvocations.map(
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
          content: toolInvocations.map((toolInvocation): ToolResultPart => {
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
