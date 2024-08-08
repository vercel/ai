import { createOpenAI } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const openai = createOpenAI({
  fetch: async (url, options) => {
    console.log(JSON.stringify(JSON.parse(options!.body! as string), null, 2));
    return await fetch(url, options);
  },
});

async function main() {
  const result = await generateObject({
    model: openai('gpt-4o-2024-08-06', {
      structuredOutputs: true,
    }),
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

  console.log(JSON.stringify(result.object, null, 2));
  console.log();
  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
}

main().catch(console.error);
