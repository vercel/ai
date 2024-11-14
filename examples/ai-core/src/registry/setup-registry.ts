import { anthropic } from '@ai-sdk/anthropic';
import { xai } from '@ai-sdk/xai';
import { groq } from '@ai-sdk/groq';
import { mistral } from '@ai-sdk/mistral';
import { openai } from '@ai-sdk/openai';
import {
  experimental_createProviderRegistry as createProviderRegistry,
  experimental_customProvider as customProvider,
} from 'ai';
import 'dotenv/config';

// custom provider with alias names:
const myAnthropic = customProvider({
  languageModels: {
    opus: anthropic('claude-3-opus-20240229'),
    sonnet: anthropic('claude-3-5-sonnet-20240620'),
    haiku: anthropic('claude-3-haiku-20240307'),
  },
  fallbackProvider: anthropic,
});

// custom provider with different model settings:
const myOpenAI = customProvider({
  languageModels: {
    // replacement model with custom settings:
    'gpt-4': openai('gpt-4', { structuredOutputs: true }),
    // alias model with custom settings:
    'gpt-4o-structured': openai('gpt-4o', { structuredOutputs: true }),
  },
  fallbackProvider: openai,
});

export const registry = createProviderRegistry({
  mistral,
  anthropic: myAnthropic,
  openai: myOpenAI,
  xai,
  groq,
});
