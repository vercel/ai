import { anthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { ModelRegistry } from 'ai';
import dotenv from 'dotenv';

dotenv.config();

export const registry = new ModelRegistry();

// register provide with prefix and custom setup
registry.registerLanguageModelProvider({
  id: 'openai',
  provider: createOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  }),
});

// register provide with prefix and default setup
registry.registerLanguageModelProvider({
  id: 'anthropic',
  provider: anthropic,
});

// register specific model with id
const groq = createOpenAI({
  baseURL: 'https://api.groq.com/openai/v1',
  apiKey: process.env.GROQ_API_KEY,
});

registry.registerLanguageModel({
  id: 'llama3',
  model: groq('llama3-8b-8192'),
});
