import { mistral } from '@ai-sdk/mistral';
import { generateObject } from 'ai';
import 'dotenv/config';
import { z } from 'zod';

async function main() {
  const result = await generateObject({
    model: mistral('open-mistral-7b'),
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
    providerOptions: {
      mistral: {
        // `open-mistral-7b` model has problems with the `$schema` property
        // in the JSON schema unless `strict` is set to true
        // See https://github.com/vercel/ai/pull/8130#issuecomment-3213138032
        strictJsonSchema: true,
      },
    },
  });

  console.log(JSON.stringify(result.object.recipe, null, 2));
  console.log();
  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
}

main().catch(console.error);
