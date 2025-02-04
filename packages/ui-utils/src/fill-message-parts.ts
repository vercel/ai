import { getMessageParts } from './get-message-parts';
import { Message, UIMessage } from './types';

export function fillMessageParts(messages: Message[]): UIMessage[] {
  return messages.map(message => ({
    ...message,
    createdAt: message.createdAt!,
    parts: getMessageParts(message),
  }));
}
