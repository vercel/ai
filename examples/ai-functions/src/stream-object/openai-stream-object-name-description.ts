import { openai } from '@ai-sdk/openai';
import { streamObject } from 'ai';
import { z } from 'zod';
import { run } from '../lib/run';

run(async () => {
  const result = streamObject({
    model: openai('gpt-4o-2024-08-06'),
    schemaName: 'recipe',
    schemaDescription: 'A recipe for lasagna.',
    schema: z.object({
      name: z.string(),
      ingredients: z.array(
        z.object({
          name: z.string(),
          amount: z.string(),
        }),
      ),
      steps: z.array(z.string()),
    }),
    prompt: 'Generate a lasagna recipe.',
  });

  for await (const partialObject of result.partialObjectStream) {
    console.clear();
    console.log(partialObject);
  }
});
