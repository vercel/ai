import { Message, ToolInvocation } from '@ai-sdk/ui-utils';
import { ResponseMessage } from '../generate-text/step-result';

/**
 * Appends the ResponseMessage[] from the response to a Message[] (for useChat).
 * The messages are converted to Messages before being appended.
 * Timestamps are generated for the new messages.
 *
 * @returns A new Message[] with the response messages appended.
 */
export function appendResponseMessages({
  messages,
  responseMessages,
}: {
  messages: Message[];
  responseMessages: ResponseMessage[];
}): Message[] {
  const clonedMessages = structuredClone(messages);

  for (const message of responseMessages) {
    const role = message.role;

    switch (role) {
      case 'assistant': {
        clonedMessages.push({
          role: 'assistant',
          id: message.id,
          createdAt: new Date(), // generate a createdAt date for the message, will be overridden by the client

          // only include text in the content:
          content:
            typeof message.content === 'string'
              ? message.content
              : message.content
                  .filter(part => part.type === 'text')
                  .map(part => part.text)
                  .join(''),

          // separate tool calls from the content:
          toolInvocations: (typeof message.content === 'string'
            ? []
            : message.content.filter(part => part.type === 'tool-call')
          ).map(call => ({ state: 'call', ...call })),
        });

        break;
      }

      case 'tool': {
        // for tool call results, add the result to previous message:
        const previousMessage = clonedMessages[clonedMessages.length - 1];
        previousMessage.toolInvocations ??= []; // ensure the toolInvocations array exists

        if (previousMessage.role !== 'assistant') {
          throw new Error(
            `Tool result must follow an assistant message: ${previousMessage.role}`,
          );
        }

        for (const part of message.content) {
          // find the tool call in the previous message:
          const toolCall = previousMessage.toolInvocations.find(
            call => call.toolCallId === part.toolCallId,
          );

          if (!toolCall) {
            throw new Error('Tool call not found in previous message');
          }

          // add the result to the tool call:
          toolCall.state = 'result';
          const toolResult = toolCall as ToolInvocation & { state: 'result' };
          toolResult.result = part.result;
        }

        break;
      }

      default: {
        const _exhaustiveCheck: never = role;
        throw new Error(`Unsupported message role: ${_exhaustiveCheck}`);
      }
    }
  }

  return clonedMessages;
}
