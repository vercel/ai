import { experimental_generateObject } from 'ai';
import { anthropic } from 'ai/anthropic';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

async function main() {
  const result = await experimental_generateObject({
    model: anthropic.messages('claude-3-opus-20240229'),
    schema: z.object({
      recipeName: z.string(),
      recipeSteps: z.string(),
    }),
    prompt: 'Generate a lasagna recipe.',
  });

  console.log(JSON.stringify(result.object, null, 2));
  console.log();
  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
}

main();
