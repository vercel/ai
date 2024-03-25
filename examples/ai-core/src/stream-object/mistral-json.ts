import { experimental_streamObject } from 'ai';
import { Mistral } from 'ai/mistral';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const mistral = new Mistral();

async function main() {
  const result = await experimental_streamObject({
    model: mistral.chat('open-mistral-7b'),
    maxTokens: 2000,
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
    mode: 'tool',
    prompt:
      'Generate 3 character descriptions for a fantasy role playing game.',
  });

  for await (const partialObject of result.partialObjectStream) {
    console.clear();
    console.log(partialObject);
  }
}

main();
