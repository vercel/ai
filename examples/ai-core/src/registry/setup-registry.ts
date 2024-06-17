import { anthropic } from '@ai-sdk/anthropic';
import { mistral } from '@ai-sdk/mistral';
import { createOpenAI } from '@ai-sdk/openai';
import { experimental_createProviderRegistry as createProviderRegistry } from 'ai';
import dotenv from 'dotenv';

dotenv.config();

export const registry = createProviderRegistry({
  // register provider with prefix and default setup:
  anthropic,
  mistral,

  // register provider with prefix and custom setup:
  openai: createOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  }),
});
