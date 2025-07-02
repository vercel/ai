// @ts-nocheck

import { generateText, streamText, generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';

// Basic object property usage
const result1 = await generateText({
  model: openai('gpt-3.5-turbo'),
  maxOutputTokens: 1024,
  prompt: 'Hello world',
});

// In streamText
const stream = streamText({
  model: openai('gpt-4-turbo'),
  maxOutputTokens: 512,
  messages: [{ role: 'user', content: 'Hi' }],
});

// In generateObject
const object = await generateObject({
  model: openai('gpt-3.5-turbo'),
  maxOutputTokens: 800,
  schema: z.object({ name: z.string() }),
  prompt: 'Generate a person',
});

// Variable usage and destructuring
const options = { maxOutputTokens: 2000, temperature: 0.7 };
const { maxOutputTokens: maxTokensFromOptions, temperature } = options;

// Member expression access
console.log(options.maxOutputTokens);

// Shorthand property
const maxTokensValue = 1500;
const config = { maxOutputTokens: maxTokensValue, model: 'gpt-4' };

// In function parameters
function callAPI(params: { maxOutputTokens: number; model: string }) {
  return params.maxOutputTokens;
}

// TypeScript interface
interface GenerateOptions {
  maxOutputTokens?: number;
  model: string;
} 