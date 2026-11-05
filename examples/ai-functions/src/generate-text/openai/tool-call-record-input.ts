import { openai } from '@ai-sdk/openai';
import { generateText, tool } from 'ai';
import { z } from 'zod';
import { print } from '../../lib/print';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: openai('gpt-4.1-mini'),
    tools: {
      setEnvironmentVariables: tool({
        description: 'Set environment variables for a deployment',
        inputSchema: z.object({
          variables: z.record(z.string().min(1), z.string()),
        }),
        execute: async ({ variables }) => ({
          updated: Object.keys(variables),
        }),
      }),
    },
    prompt: 'Set NODE_ENV to production and LOG_LEVEL to debug.',
  });

  print('Tool calls:', result.toolCalls);
  print('Tool results:', result.toolResults);
  print('Warnings:', result.warnings);
});
