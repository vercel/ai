import { openai } from '@ai-sdk/openai';
import { stepCountIs, streamText, tool } from 'ai';
import 'dotenv/config';
import { z } from 'zod';

async function main() {
  const result = streamText({
    model: openai('gpt-4o-2024-08-06'),
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
    prompt: 'What is the weather in my current location?',

    onStepFinish: step => {
      console.log(JSON.stringify(step, null, 2));
    },
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }
}

main().catch(console.error);
