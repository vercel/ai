import { anthropic } from '@ai-sdk/anthropic';
import { streamObject } from 'ai';
import { z } from 'zod';

import { run } from '../lib/run';

run(async () => {
  const result = streamObject({
    model: anthropic('claude-sonnet-4-20250514'),
    maxOutputTokens: 5000,
    schema: z.object({
      characters: z.array(
        z.object({
          name: z.string(),
          class: z
            .string()
            .describe('Character class, e.g. warrior, mage, or thief.'),
          description: z.string(),
        }),
      ),
    }),
    prompt:
      'Generate 3 character descriptions for a fantasy role playing game.',
    headers: {
      'anthropic-beta': 'fine-grained-tool-streaming-2025-05-14',
    },
  });

  for await (const partialObject of result.partialObjectStream) {
    console.clear();
    console.log(partialObject);
  }
});
