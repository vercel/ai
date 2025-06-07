// @ts-nocheck
import { generateText, streamText, generateObject } from 'ai';

// Basic string content transformation
const result1 = await generateText({
  messages: [
    {
      role: 'user',
      content: 'Hello world!'
    }
  ]
});

// Multiple messages with content
const result2 = await streamText({
  messages: [
    {
      role: 'user',
      content: 'First message'
    },
    {
      role: 'assistant',
      content: 'Assistant response'
    },
    {
      role: 'user',
      content: 'Second user message'
    }
  ]
});

// Template literal content
const name = 'Alice';
const result3 = await generateObject({
  messages: [
    {
      role: 'user',
      content: `Hello ${name}!`
    }
  ]
});

// Variable content
const userMessage = 'What is the weather?';
const result4 = await generateText({
  messages: [
    {
      role: 'user',
      content: userMessage
    }
  ]
});

// Already has parts property - should not be transformed
const result5 = await generateText({
  messages: [
    {
      role: 'user',
      content: 'This should not change',
      parts: [{ type: 'text', text: 'Already has parts' }]
    }
  ]
});

// Message without content - should not be affected
const result6 = await generateText({
  messages: [
    {
      role: 'user',
      parts: [{ type: 'text', text: 'No content property' }]
    }
  ]
});

// Non-AI method call - should not be affected
const otherFunction = (options: any) => {};
otherFunction({
  messages: [
    {
      role: 'user',
      content: 'This should not change'
    }
  ]
});

// String-quoted property name
const result7 = await generateText({
  messages: [
    {
      role: 'user',
      'content': 'String-quoted content'
    }
  ]
}); 