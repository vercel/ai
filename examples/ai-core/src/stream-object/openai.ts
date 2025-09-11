import { openai } from '@ai-sdk/openai';
import { streamObject } from 'ai';
import 'dotenv/config';
import { z } from 'zod';

async function main() {
  const result = streamObject({
    model: openai('gpt-4o-mini'),
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

  console.log(JSON.stringify((await result.request).body, null, 2));
}

main().catch(console.error);
