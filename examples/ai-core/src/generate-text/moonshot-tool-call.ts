import { moonshot } from '@ai-sdk/moonshot';
import { generateText, tool } from 'ai';
import 'dotenv/config';
import { z } from 'zod/v4';

async function main() {
  const { text } = await generateText({
    model: moonshot('kimi-k2-0711-preview'),
    tools: {
      weather: tool({
        description: 'Get the weather in a location',
        inputSchema: z.object({
          location: z.string().describe('The location to get the weather for'),
        }),
        execute: async ({ location }) => ({
          location,
          temperature: 72 + Math.floor(Math.random() * 21) - 10,
        }),
      }),
    },
    prompt: 'What is the weather in Tokyo?',
  });

  console.log(text);
}

main().catch(console.error);
