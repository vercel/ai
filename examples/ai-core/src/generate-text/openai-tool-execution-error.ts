import { openai } from '@ai-sdk/openai';
import { generateText, tool } from 'ai';
import 'dotenv/config';
import { z } from 'zod/v4';

async function main() {
  const result = await generateText({
    model: openai('gpt-4o-mini'),
    tools: {
      weather: tool({
        description: 'Get the weather in a location',
        inputSchema: z.object({
          location: z.string().describe('The location to get the weather for'),
        }),
        execute: async ({ location }): Promise<{ temperature: number }> => {
          throw new Error('could not get weather');
        },
      }),
    },
    prompt: 'What is the weather in San Francisco?',
  });

  console.log(JSON.stringify(result.content, null, 2));

  console.log(JSON.stringify(result.response.messages, null, 2));
}

main().catch(console.error);
