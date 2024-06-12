import { anthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createModelRegistry } from 'ai';
import dotenv from 'dotenv';

dotenv.config();

export const registry = createModelRegistry({
  // register provide with prefix and default setup:
  anthropic,

  // register provide with prefix and custom setup:
  openai: createOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  }),
});
