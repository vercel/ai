import { openai } from '@ai-sdk/openai';
import { streamObject } from 'ai';
import 'dotenv/config';
import { z } from 'zod';

async function main() {
  const result = streamObject({
    model: openai('gpt-4o-mini', { structuredOutputs: true }),
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

  // consume stream
  for await (const part of result.partialObjectStream) {
  }

  console.log('REQUEST BODY');
  console.log((await result.request).body);
}

main().catch(console.error);
