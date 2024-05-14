import { ToolResult } from '../generate-text/tool-result';
import { CoreMessage } from '../prompt';

/**
Converts an array of messages from useChat into an array of CoreMessages that can be used
with the AI core functions (e.g. `streamText`).
 */
export function convertToCoreMessages(
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    toolInvocations?: Array<ToolResult<string, unknown, unknown>>;
  }>,
) {
  const coreMessages: CoreMessage[] = [];

  for (const { role, content, toolInvocations } of messages) {
    switch (role) {
      case 'user': {
        coreMessages.push({ role: 'user', content });
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
            ...toolInvocations.map(({ toolCallId, toolName, args }) => ({
              type: 'tool-call' as const,
              toolCallId,
              toolName,
              args,
            })),
          ],
        });

        // tool message with tool results
        coreMessages.push({
          role: 'tool',
          content: toolInvocations.map(
            ({ toolCallId, toolName, args, result }) => ({
              type: 'tool-result' as const,
              toolCallId,
              toolName,
              args,
              result,
            }),
          ),
        });

        break;
      }

      default: {
        const _exhaustiveCheck: never = role;
        throw new Error(`Unhandled role: ${_exhaustiveCheck}`);
      }
    }
  }

  return coreMessages;
}
