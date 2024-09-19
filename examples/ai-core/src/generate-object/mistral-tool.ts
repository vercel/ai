import { mistral } from '@ai-sdk/mistral';
import { generateObject } from 'ai';
import 'dotenv/config';
import { z } from 'zod';

async function main() {
  const result = await generateObject({
    model: mistral('mistral-large-latest'),
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

  console.log(JSON.stringify(result.object, null, 2));
}

main().catch(console.error);
