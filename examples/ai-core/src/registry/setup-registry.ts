import { anthropic } from '@ai-sdk/anthropic';
import { createOpenAI, openai } from '@ai-sdk/openai';
import {
  experimental_createProviderRegistry as createProviderRegistry,
  customProvider,
} from 'ai';
import dotenv from 'dotenv';

dotenv.config();

export const registry = createProviderRegistry({
  // register provider with prefix and default setup:
  anthropic,

  // register provider with custom settings for some models:
  openai: customProvider({
    languageModels: {
      'gpt-4': openai('gpt-4', { structuredOutputs: true }),
      'gpt-4o': openai('gpt-4o', { structuredOutputs: true }),
      'gpt-4o-mini': openai('gpt-4o-mini', { structuredOutputs: true }),
    },
    fallbackProvider: openai,
  }),

  // register provider with custom setup:
  groq: createOpenAI({
    baseURL: 'https://api.groq.com/openai/v1',
    apiKey: process.env.GROQ_API_KEY,
  }),
});
