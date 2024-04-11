import { experimental_generateObject } from 'ai';
import { Mistral } from '@ai-sdk/mistral';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const mistral = new Mistral();

async function main() {
  const result = await experimental_generateObject({
    model: mistral.chat('open-mistral-7b'),
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
