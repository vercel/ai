import { generateObject } from 'ai/core';
import { fireworks } from 'ai/provider';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

async function main() {
  const result = await generateObject({
    model: fireworks.chat({ id: 'accounts/fireworks/models/firefunction-v1' }),
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
    prompt:
      'Generate 3 character descriptions for a fantasy role playing game.',
  });

  console.log(JSON.stringify(result.object, null, 2));
}

main();
