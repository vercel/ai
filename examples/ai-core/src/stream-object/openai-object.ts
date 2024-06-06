import { openai } from '@ai-sdk/openai';
import { streamObject } from 'ai';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

async function main() {
  const result = await streamObject({
    model: openai('gpt-4-turbo'),
    schema: z.object({
      recipe: z.object({
        name: z.string(),
        ingredients: z.array(z.string()),
        steps: z.array(z.string()),
      }),
    }),
    prompt: 'Generate a lasagna recipe.',
  });

  result.object
    .then(({ recipe }) => {
      // do something with the fully typed, final object:
      console.log('Recipe:', JSON.stringify(recipe, null, 2));
    })
    .catch(error => {
      // handle type validation failure
      // (when the object does not match the schema):
      console.error(error);
    });

  // consume stream:
  for await (const partialObject of result.partialObjectStream) {
  }
}

main().catch(console.error);
