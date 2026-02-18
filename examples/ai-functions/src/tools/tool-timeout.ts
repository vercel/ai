import { openai } from '@ai-sdk/openai';
import { generateText, tool } from 'ai';
import 'dotenv/config';
import { z } from 'zod';
import { run } from '../lib/run';

run(async () => {
  console.log('Testing tool with 2 second timeout (should succeed)...\n');

  const result1 = await generateText({
    model: openai('gpt-4o-mini'),
    tools: {
      fastTool: tool({
        description: 'A fast tool that completes quickly',
        inputSchema: z.object({
          input: z.string(),
        }),
        timeout: 2000,
        execute: async ({ input }) => {
          await new Promise(resolve => setTimeout(resolve, 100));
          return { result: `Processed: ${input}` };
        },
      }),
    },
    toolChoice: 'required',
    prompt: 'Call the fastTool with input "hello"',
  });

  console.log('Fast tool result:');
  console.log(JSON.stringify(result1.content, null, 2));
  console.log();

  console.log('Testing tool with 100ms timeout (should fail)...\n');

  const result2 = await generateText({
    model: openai('gpt-4o-mini'),
    tools: {
      slowTool: tool({
        description: 'A slow tool that takes too long',
        inputSchema: z.object({
          input: z.string(),
        }),
        timeout: 100,
        execute: async ({ input }) => {
          await new Promise(resolve => setTimeout(resolve, 2000));
          return { result: `Processed: ${input}` };
        },
      }),
    },
    toolChoice: 'required',
    prompt: 'Call the slowTool with input "hello"',
  });

  console.log('Slow tool result (should show tool-error):');
  console.log(JSON.stringify(result2.content, null, 2));
});
