import { groq } from '@ai-sdk/groq';
import { generateObject } from 'ai';
import { z } from 'zod';
import { run } from '../lib/run';

run(async () => {
  const result = await generateObject({
    model: groq('moonshotai/kimi-k2-instruct-0905'),
    schema: z.object({
      recipe: z.object({
        name: z.string(),
        ingredients: z.array(z.string()),
        instructions: z.array(z.string()),
      }),
    }),
    prompt: 'Generate a simple pasta recipe.',
  });

  console.log(JSON.stringify(result.object, null, 2));
});
