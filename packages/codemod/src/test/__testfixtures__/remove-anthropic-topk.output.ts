// @ts-nocheck
import { createAnthropic } from '@ai-sdk/anthropic';
import { generateText, streamText } from 'ai';

const anthropicClient = createAnthropic({
  temperature: 0.7
});

const result = await generateText({
  model: anthropicClient('claude-3'),
  prompt: 'Hello',
  topK: 10
});

const stream = await streamText({
  model: anthropicClient('claude-3'),
  prompt: 'Hello',
  topK: 10
});
