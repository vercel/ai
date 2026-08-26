import { moonshotai } from '@ai-sdk/moonshotai';
import { generateObject } from 'ai';
import 'dotenv/config';
import { z } from 'zod';

async function main() {
  const result = await generateObject({
    model: moonshotai('moonshot-v1-8k'),
    schemaName: 'recipe',
    schema: z.object({
      name: z.string(),
      ingredients: z.array(z.string()),
      steps: z.array(z.string()),
    }),
    prompt:
      'Generate a simple pasta recipe as an object with a name, ingredients, and steps.',
  });

  console.log(JSON.stringify(result.object, null, 2));
}

main().catch(console.error);
