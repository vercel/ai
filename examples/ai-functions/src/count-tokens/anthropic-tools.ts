import { anthropic } from '@ai-sdk/anthropic';
import { countTokens, tool } from 'ai';
import { z } from 'zod';
import { run } from '../lib/run';

run(async () => {
  const result = await countTokens({
    model: anthropic('claude-sonnet-4-5-20250929'),
    messages: [
      {
        role: 'user',
        content: 'What is the weather in San Francisco?',
      },
    ],
    tools: {
      weather: tool({
        description: 'Get the current weather in a location',
        inputSchema: z.object({
          location: z.string().describe('The city and state'),
        }),
      }),
    },
  });

  console.log('Token count (with tools):', result.tokens);
});
