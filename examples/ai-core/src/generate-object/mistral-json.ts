import { mistral } from '@ai-sdk/mistral';
import { generateObject } from 'ai';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

async function main() {
  const result = await generateObject({
    model: mistral('open-mistral-7b'),
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
    mode: 'json',
    prompt:
      'Generate 3 character descriptions for a fantasy role playing game.',
  });

  console.log(JSON.stringify(result.object, null, 2));
}

main().catch(console.error);
