import { aihubmix } from '@ai-sdk/aihubmix';
import { streamObject } from 'ai';
import 'dotenv/config';
import { z } from 'zod';

async function main() {
  const result = streamObject({
    model: aihubmix('gpt-4o-mini', { structuredOutputs: true }),
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

  for await (const objectPart of result.partialObjectStream) {
    console.log(objectPart);
  }

  console.log('Token usage:', await result.usage);
}

main().catch(console.error); 
