import { deepseek } from '@ai-sdk/deepseek';
import { generateObject } from 'ai';
import { z } from 'zod';
import { run } from '../lib/run';

run(async () => {
    const result = await generateObject({
    model: deepseek("deepseek-chat"),
    prompt: `Generate a random person`,
    schema: z.object({
      name: z.string().describe("The name of the person"),
      age: z.number().describe("The age of the person")
    }),
  });

  console.log(JSON.stringify(result, null, 2));
});