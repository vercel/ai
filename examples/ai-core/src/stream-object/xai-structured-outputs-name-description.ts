import { xai } from '@ai-sdk/xai';
import { streamObject } from 'ai';
import 'dotenv/config';
import { z } from 'zod';

async function main() {
  const result = streamObject({
    model: xai('grok-3-beta'),
    schemaName: 'recipe',
    schemaDescription: 'A recipe for lasagna.',
    schema: z.object({
      name: z.string(),
      ingredients: z.array(
        z.object({
          name: z.string(),
          amount: z.string(),
        }),
      ),
      steps: z.array(z.string()),
    }),
    prompt: 'Generate a lasagna recipe.',
  });

  for await (const partialObject of result.partialObjectStream) {
    console.clear();
    console.log(partialObject);
  }
}

main().catch(console.error);
