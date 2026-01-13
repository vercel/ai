import { vertex } from '@ai-sdk/google-vertex';
import { streamObject } from 'ai';
import { z } from 'zod';
import { run } from '../lib/run';

run(async () => {
  const result = streamObject({
    model: vertex('gemini-1.5-pro'),
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
  });

  for await (const partialObject of result.partialObjectStream) {
    console.clear();
    console.log(partialObject);
  }
});
