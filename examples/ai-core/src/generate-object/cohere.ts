import { cohere } from '@ai-sdk/cohere';
import { generateObject } from 'ai';
import 'dotenv/config';
import { z } from 'zod/v4';

async function main() {
  const result = await generateObject({
    model: cohere('command-a-03-2025'),
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
