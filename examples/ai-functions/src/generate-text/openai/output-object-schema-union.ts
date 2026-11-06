import { openai } from '@ai-sdk/openai';
import { generateText, Output } from 'ai';
import { z } from 'zod';
import { print } from '../../lib/print';
import { run } from '../../lib/run';

const schemas = {
  recipe: z.object({
    type: z.literal('recipe'),
    name: z.string(),
    ingredients: z.array(z.string()),
  }),
  movie: z.object({
    type: z.literal('movie'),
    title: z.string(),
    year: z.number(),
  }),
};

async function generate(kind: keyof typeof schemas) {
  const result = await generateText({
    model: openai('gpt-6-luna'),
    output: Output.object({ schema: schemas[kind] }),
    prompt: `Generate a ${kind}.`,
  });

  const output = result.output;

  switch (output.type) {
    case 'recipe':
      print('Recipe:', output.ingredients);
      break;
    case 'movie':
      print('Movie:', `${output.title} (${output.year})`);
      break;
  }
}

run(async () => {
  await generate('recipe');
});
