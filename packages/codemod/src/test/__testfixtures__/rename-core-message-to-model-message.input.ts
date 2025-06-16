// @ts-nocheck

import { CoreMessage, generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';

// Type annotation
const messages: CoreMessage[] = [
  { role: 'user', content: 'Hello' },
  { role: 'assistant', content: 'Hi there!' }
];

// Function parameter type
function processMessages(msgs: CoreMessage[]) {
  return msgs.length;
}

// Variable declaration with type
const message: CoreMessage = { role: 'user', content: 'Test' };

// Function return type
function createMessage(): CoreMessage {
  return { role: 'user', content: 'Created' };
}

// Generic type parameter
function handleMessages<T extends CoreMessage>(messages: T[]): T[] {
  return messages;
}

// Interface extending CoreMessage
interface CustomMessage extends CoreMessage {
  timestamp: number;
}

// Type alias
type MessageArray = CoreMessage[];

// Usage in generateText
const result = await generateText({
  model: anthropic('claude-3-5-sonnet-20241022'),
  messages: messages as CoreMessage[]
}); 