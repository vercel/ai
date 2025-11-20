import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import 'dotenv/config';
import { z } from 'zod';

async function main() {
  const result = await generateObject({
    model: openai('gpt-5'),
    schema: z.object({
      analysis: z.object({
        problem: z.string(),
        solution: z.object({
          approach: z.string(),
          steps: z.array(z.string()),
          timeComplexity: z.string(),
          spaceComplexity: z.string(),
        }),
        code: z.string(),
      }),
    }),
    prompt:
      'Analyze and solve: How would you implement a function to find the longest palindromic substring in a string?',
  });

  console.log(JSON.stringify(result.object.analysis, null, 2));
  console.log();
  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
}

main().catch(console.error);
