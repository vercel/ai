import { openai } from '@ai-sdk/openai';
import { streamObject } from 'ai';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

async function main() {
  const result = await streamObject({
    model: openai('gpt-4o-2024-08-06', { structuredOutputs: true }),
    output: 'array',
    schema: z.object({
      name: z.string(),
      class: z
        .string()
        .describe('Character class, e.g. warrior, mage, or thief.'),
      description: z.string(),
    }),
    prompt: 'Generate 3 hero descriptions for a fantasy role playing game.',
  });

  for await (const hero of result.elementStream) {
    console.log(hero);
  }
}

main().catch(console.error);
