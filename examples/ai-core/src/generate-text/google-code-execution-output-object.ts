import { google } from '@ai-sdk/google';
import { generateText, Output } from 'ai';
import 'dotenv/config';
import { z } from 'zod';

async function main() {
  const result = await generateText({
    model: google('gemini-3-flash-preview'),
    tools: {
      code_execution: google.tools.codeExecution({}),
    },
    output: Output.object({
      schema: z.object({
        answer: z.number(),
        explanation: z.string(),
      }),
    }),
    prompt:
      'Calculate the sum of the first 50 prime numbers. Make sure to use the python tool. Show your work.',
  });

  console.log(JSON.stringify(result.output, null, 2));
  console.log('Tool calls:', JSON.stringify(result.toolCalls, null, 2));
}

main().catch(console.error);
