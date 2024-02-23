import { generateObject, zodSchema } from 'ai/function';
import { openai } from 'ai/provider';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const result = await generateObject({
  model: openai.chat({
    id: 'gpt-4-turbo-preview',
    maxTokens: 2000,
  }),

  schema: zodSchema(
    z.object({
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
  ),

  prompt: 'Generate 3 character descriptions for a fantasy role playing game.',
});

console.log(JSON.stringify(result.object, null, 2));
