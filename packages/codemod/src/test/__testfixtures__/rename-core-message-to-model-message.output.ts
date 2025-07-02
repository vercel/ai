// @ts-nocheck

import { ModelMessage, generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';

// Type annotation
const messages: ModelMessage[] = [
  { role: 'user', content: 'Hello' },
  { role: 'assistant', content: 'Hi there!' }
];

// Function parameter type
function processMessages(msgs: ModelMessage[]) {
  return msgs.length;
}

// Variable declaration with type
const message: ModelMessage = { role: 'user', content: 'Test' };

// Function return type
function createMessage(): ModelMessage {
  return { role: 'user', content: 'Created' };
}

// Generic type parameter
function handleMessages<T extends ModelMessage>(messages: T[]): T[] {
  return messages;
}

// Interface extending CoreMessage
interface CustomMessage extends ModelMessage {
  timestamp: number;
}

// Type alias
type MessageArray = ModelMessage[];

// Usage in generateText
const result = await generateText({
  model: anthropic('claude-3-5-sonnet-20241022'),
  messages: messages as ModelMessage[]
}); 