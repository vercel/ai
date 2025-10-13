import {
  AssistantModelMessage,
  ModelMessage,
  ToolModelMessage,
} from '@ai-sdk/provider-utils';

export function pruneModelMessages({
  messages,
  reasoning = 'none',
  toolCalls = [],
}: {
  messages: ModelMessage[];
  reasoning?: 'all' | 'before-last-message' | 'none';
  toolCalls?:
    | 'all'
    | 'before-last-message'
    | `before-last-${number}-messages`
    | 'none'
    | Array<{
        type:
          | 'all'
          | 'before-last-message'
          | `before-last-${number}-messages`
          | 'none';
        tools?: string[];
      }>;
}): ModelMessage[] {
  // reasoning
  if (reasoning === 'all' || reasoning === 'before-last-message') {
    messages = messages.map((message, messageIndex) => {
      if (message.role !== 'assistant' || typeof message.content === 'string') {
        return message;
      }

      return {
        ...message,
        content: message.content.filter(
          part =>
            part.type !== 'reasoning' ||
            (reasoning === 'before-last-message' &&
              messageIndex === messages.length - 1),
        ),
      };
    });
  }

  // tool calls
  if (toolCalls === 'all') {
    messages = messages
      .map(message => {
        if (
          message.role === 'user' ||
          message.role === 'system' ||
          typeof message.content === 'string'
        ) {
          return message;
        }

        return {
          ...message,
          content: message.content.filter(
            part => part.type !== 'tool-call' && part.type !== 'tool-result',
          ),
        } as AssistantModelMessage | ToolModelMessage;
      })
      .filter(message => message.content.length > 0);
  }

  return messages;
}
