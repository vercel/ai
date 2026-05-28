import { anthropic } from '@ai-sdk/anthropic';
import { generateObject } from 'ai';
import { z } from 'zod';
import { run } from '../lib/run';

run(async () => {
  const result = await generateObject({
    model: anthropic('claude-sonnet-4-5'),
    providerOptions: {
      anthropic: {
        structuredOutputMode: 'outputFormat',
      },
    },
    schema: z.object({
      recipe: z.object({
        name: z.string(),
        ingredients: z
          .array(z.object({ name: z.string(), amount: z.string() }))
          .min(10)
          .max(12),
        steps: z.array(z.string()),
      }),
    }),
    prompt: 'Generate a lasagna recipe.',
  });

  console.dir(result.request.body, { depth: Infinity });
  console.log();
  console.log(JSON.stringify(result.object, null, 2));
});
