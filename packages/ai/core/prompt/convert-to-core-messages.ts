import { Attachment, ToolInvocation } from '@ai-sdk/ui-utils';
import { CoreMessage } from '../prompt';
import { attachmentsToParts } from './attachments-to-parts';
import { MessageConversionError } from './message-conversion-error';

// Compatible with Message. Interface is limited to increase flexibility.
// Only exposed internally.
export type ConvertibleMessage = {
  role:
    | 'system'
    | 'user'
    | 'assistant'
    | 'function' // @deprecated
    | 'data'
    | 'tool'; // @deprecated

  content: string;
  toolInvocations?: ToolInvocation[];
  experimental_attachments?: Attachment[];
};

/**
Converts an array of messages from useChat into an array of CoreMessages that can be used
with the AI core functions (e.g. `streamText`).

Only full tool calls are included in assistant messages. Partial tool calls are removed.
 */
export function convertToCoreMessages(messages: Array<ConvertibleMessage>) {
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
            ...toolInvocations
              .filter(invocation => invocation.state !== 'partial-call')
              .map(({ toolCallId, toolName, args }) => ({
                type: 'tool-call' as const,
                toolCallId,
                toolName,
                args,
              })),
          ],
        });

        // tool message with tool results
        const toolResults = toolInvocations
          .filter(invocation => invocation.state === 'result')
          .map(({ toolCallId, toolName, args, result }) => ({
            type: 'tool-result' as const,
            toolCallId,
            toolName,
            args,
            result,
          }));

        if (toolResults.length > 0) {
          coreMessages.push({
            role: 'tool',
            content: toolResults,
          });
        }

        break;
      }

      case 'function':
      case 'data':
      case 'tool': {
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
