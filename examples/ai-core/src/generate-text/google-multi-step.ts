import { google } from '@ai-sdk/google';
import { generateText, stepCountIs, tool } from 'ai';
import 'dotenv/config';
import { z } from 'zod';

async function main() {
  const { text } = await generateText({
    model: google('gemini-1.5-pro'),
    tools: {
      currentLocation: tool({
        description: 'Get the current location.',
        inputSchema: z.object({}),
        execute: async () => {
          const locations = ['New York', 'London', 'Paris'];
          return {
            location: locations[Math.floor(Math.random() * locations.length)],
          };
        },
      }),
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
    stopWhen: stepCountIs(5),
    // prompt: 'What is the weather in my current location?',
    prompt: 'What is the weather in Paris?',
  });

  console.log(text);
}

main().catch(console.error);
