import { Attachment, ToolInvocation } from '@ai-sdk/ui-utils';
import { CoreMessage } from '../prompt';
import { attachmentsToParts } from './attachments-to-parts';
import { MessageConversionError } from './message-conversion-error';

/**
Converts an array of messages from useChat into an array of CoreMessages that can be used
with the AI core functions (e.g. `streamText`).
 */
export function convertToCoreMessages(
  messages: Array<{
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
  }>,
) {
  const coreMessages: CoreMessage[] = [];

  for (const {
    role,
    content,
    toolInvocations,
    experimental_attachments,
  } of messages) {
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
          content: toolInvocations.map(ToolInvocation => {
            if (!('result' in ToolInvocation)) {
              throw new MessageConversionError({
                role,
                message:
                  'ToolInvocation must have a result: ' +
                  JSON.stringify(ToolInvocation),
              });
            }

            const { toolCallId, toolName, args, result } = ToolInvocation;

            return {
              type: 'tool-result' as const,
              toolCallId,
              toolName,
              args,
              result,
            };
          }),
        });

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
          role,
          message: `Unsupported role: ${_exhaustiveCheck}`,
        });
      }
    }
  }

  return coreMessages;
}
