import { vertex } from '@ai-sdk/google-vertex';
import { generateObject } from 'ai';
import 'dotenv/config';
import { z } from 'zod/v4';

async function main() {
  const result = await generateObject({
    model: vertex('gemini-1.5-pro'),
    schema: z.object({
      recipe: z.object({
        name: z.literal('Lasagna'),
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
