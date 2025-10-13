import { ModelMessage } from '@ai-sdk/provider-utils';

export function pruneModelMessages({
  messages,
  reasoning = 'none',
  toolCalls = 'none',
}: {
  messages: ModelMessage[];
  reasoning?: 'all' | 'before-trailing-message' | 'none';
  toolCalls?:
    | 'all'
    | `before-trailing-${number}-messages`
    | 'none'
    | {
        type: 'inactive';
        activeTools: string[];
      };
}) {
  // reasoning
  if (reasoning === 'all') {
    messages = messages.map(message => {
      if (message.role !== 'assistant' || typeof message.content === 'string') {
        return message;
      }

      return {
        ...message,
        content: message.content.filter(part => part.type !== 'reasoning'),
      };
    });
  } else if (reasoning === 'before-trailing-message') {
    messages = messages.map((message, messageIndex) => {
      if (message.role !== 'assistant' || typeof message.content === 'string') {
        return message;
      }

      return {
        ...message,
        content: message.content.filter(
          part =>
            part.type !== 'reasoning' || messageIndex === messages.length - 1,
        ),
      };
    });
  }

  return messages;
}
