import { streamText, createTool } from 'ai/function';
import { openai } from 'ai/provider';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const result = await streamText({
  model: openai.chat({
    id: 'gpt-3.5-turbo',
  }),

  tools: [
    createTool({
      name: 'weather',
      description: 'Get the weather in a location',
      parameters: z.object({
        location: z.string().describe('The location to get the weather for'),
      }),
      execute: async ({ location }) => ({
        location,
        temperature: 72,
        description: 'sunny',
      }),
    }),
  ],

  prompt: 'What is the weather in San Francisco?',
});

for await (const part of result.fullStream) {
  console.log(JSON.stringify(part, null, 2));
}
