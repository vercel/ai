// @ts-nocheck

import { generateObject, streamObject, generateText, streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

// generateObject with providerMetadata
const objectResult = await generateObject({
  model: openai('gpt-4'),
  schema: z.object({ name: z.string() }),
  prompt: 'Generate a person',
  providerOptions: {
    openai: { store: false }
  }
});

// streamObject with providerMetadata
const objectStream = streamObject({
  model: openai('gpt-4'),
  schema: z.object({ name: z.string() }),
  prompt: 'Generate a person',
  providerOptions: {
    openai: { store: false }
  }
});

// generateText with providerMetadata
const textResult = await generateText({
  model: openai('gpt-4'),
  prompt: 'Hello world',
  providerOptions: {
    openai: { store: false }
  }
});

// streamText with providerMetadata
const textStream = streamText({
  model: openai('gpt-4'),
  prompt: 'Hello world',
  providerOptions: {
    openai: { store: false }
  }
});

// Multiple provider options
const multiProviderResult = await generateObject({
  model: openai('gpt-4'),
  schema: z.object({ name: z.string() }),
  prompt: 'Generate a person',
  providerOptions: {
    openai: { store: false },
    anthropic: { cacheControl: { type: 'ephemeral' } }
  }
}); 