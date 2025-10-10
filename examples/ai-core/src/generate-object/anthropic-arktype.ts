import { anthropic } from '@ai-sdk/anthropic';
import { generateObject } from 'ai';
import { type } from 'arktype';
import { run } from '../lib/run';

run(async () => {
  const result = await generateObject({
    model: anthropic('claude-3-7-sonnet-latest'),
    schema: type({
      recipe: {
        name: 'string',
        ingredients: type({ name: 'string', amount: 'string' }).array(),
        steps: 'string[]',
      },
    }),
    prompt: 'Generate a lasagna recipe.',
  });

  console.dir(result.object.recipe, { depth: Infinity });
});
