import { anthropic } from '@ai-sdk/anthropic';
import { generateObject } from 'ai';
import { Schema } from 'effect';
import { run } from '../lib/run';

run(async () => {
  const result = await generateObject({
    model: anthropic('claude-3-7-sonnet-latest'),
    schema: Schema.standardSchemaV1(
      Schema.Struct({
        recipe: Schema.Struct({
          name: Schema.String,
          ingredients: Schema.Array(
            Schema.Struct({
              name: Schema.String,
              amount: Schema.String,
            }),
          ),
          steps: Schema.Array(Schema.String),
        }),
      }),
    ),
    prompt: 'Generate a lasagna recipe.',
  });

  console.dir(result.object.recipe, { depth: Infinity });
});
