import {
  AssistantModelMessage,
  ModelMessage,
  ToolModelMessage,
} from '@ai-sdk/provider-utils';

export function pruneMessages({
  messages,
  reasoning = 'none',
  toolCalls = [],
  emptyMessages = 'remove',
}: {
  messages: ModelMessage[];
  reasoning?: 'all' | 'before-last-message' | 'none';
  toolCalls?:
    | 'all'
    | 'before-last-message'
    | `before-last-${number}-messages`
    | 'none'
    | Array<{
        type: 'all' | 'before-last-message' | `before-last-${number}-messages`;
        tools?: string[];
      }>;
  emptyMessages?: 'keep' | 'remove';
}): ModelMessage[] {
  // filter reasoning parts:
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

  // filter tool calls, results, errors, and approvals:
  if (toolCalls === 'none') {
    toolCalls = [];
  } else if (toolCalls === 'all') {
    toolCalls = [{ type: 'all' }];
  } else if (toolCalls === 'before-last-message') {
    toolCalls = [{ type: 'before-last-message' }];
  } else if (typeof toolCalls === 'string') {
    toolCalls = [{ type: toolCalls }];
  }

  for (const toolCall of toolCalls) {
    if (toolCall.type === 'all') {
      messages = messages.map(message => {
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
            part =>
              part.type !== 'tool-call' &&
              part.type !== 'tool-result' &&
              part.type !== 'tool-approval-request' &&
              part.type !== 'tool-approval-response',
          ),
        } as AssistantModelMessage | ToolModelMessage;
      });
    }
  }

  if (emptyMessages === 'remove') {
    messages = messages.filter(message => message.content.length > 0);
  }

  return messages;
}
