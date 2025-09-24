import { anthropic } from '@ai-sdk/anthropic';
import { stepCountIs, streamText } from 'ai';
import { tool } from 'ai';
import { z } from 'zod';
import { run } from '../lib/run';

export const weatherTool = tool({
  description: 'Get the weather in a location',
  inputSchema: z.object({
    location: z.string().describe('The location to get the weather for'),
  }),
  // location below is inferred to be a string:
  execute: async ({ location }) => ({
    location,
    temperature: 72 + Math.floor(Math.random() * 21) - 10,
  }),
});

const tools = { weatherTool } as const;

run(async () => {
  const result = streamText({
    model: anthropic('claude-sonnet-4-20250514'),
    messages: [
      { role: 'user', content: 'node' },
      {
        role: 'assistant',
        content:
          'nodejs is a runtime environment for executing JavaScript code outside of a web browser.',
      },
      {
        role: 'user',
        content:
          'https://github.com/vercel/ai/issues/8865 analyze the issue and give me a summary',
      },
    ],
    tools: tools,
    providerOptions: {
      anthropic: {
        stream: true,
        thinking: {
          type: 'enabled',
          budgetTokens: 3276,
        },
      },
    },
    stopWhen: stepCountIs(10),
    // experimental_transform: transfrom
  });

  for await (const part of result.fullStream) {
    console.log(JSON.stringify(part));
  }

  console.log();
  console.log('Sources:', (await result.sources).length);
  console.log('Usage:', await result.usage);
  console.log();
});
