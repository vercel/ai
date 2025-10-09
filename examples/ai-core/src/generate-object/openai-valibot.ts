import { anthropic } from '@ai-sdk/anthropic';
import { generateObject } from 'ai';
import * as v from 'valibot';
import { run } from '../lib/run';

run(async () => {
  const result = await generateObject({
    model: anthropic('claude-3-5-sonnet-20240620'),
    schema: v.object({
      recipe: v.object({
        name: v.string(),
        ingredients: v.array(
          v.object({
            name: v.string(),
            amount: v.string(),
          }),
        ),
        steps: v.array(v.string()),
      }),
    }),
    prompt: 'Generate a lasagna recipe.',
  });

  console.dir(result.object.recipe, { depth: Infinity });
});
