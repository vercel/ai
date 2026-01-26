import { vertex } from '@ai-sdk/google-vertex';
import { generateText, Output, tool, stepCountIs } from 'ai';
import { z } from 'zod';
import { run } from '../lib/run';

run(async () => {
  const { output } = await generateText({
    model: vertex('gemini-3-pro-preview'),
    tools: {
      calculate: tool({
        description: 'Calculate something',
        inputSchema: z.object({
          input: z.number().describe('The number to calculate'),
        }),
        execute: async ({ input }) => {
          console.log('Calculating', input);
          return { result: input * 2 };
        },
      }),
    },
    stopWhen: stepCountIs(5),
    output: Output.object({
      schema: z.object({ answer: z.string() }),
    }),
    prompt: 'Use the tool to calculate 5*2 and give me a structured answer',
  });

  console.log('Output:', output);
});
