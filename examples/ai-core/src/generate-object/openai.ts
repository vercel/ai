import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

async function main() {
  const result = await generateObject({
    model: openai('gpt-4-turbo'),
    schema: z.object({
      recipe: z.object({
        name: z.string(),
        ingredients: z.array(
          z.object({
            name: z.string(),
            amount: z.string(),
          }),
        ),
        steps: z.array(z.string()),
      }),
    }),
    prompt: 'Generate a lasagna recipe.',
  });

  console.log(JSON.stringify(result.object.recipe, null, 2));
  console.log();
  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
}

main().catch(console.error);
