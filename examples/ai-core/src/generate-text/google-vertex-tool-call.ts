import { vertex } from '@ai-sdk/google-vertex';
import { generateText, tool } from 'ai';
import 'dotenv/config';
import { z } from 'zod';

async function main() {
  const { text } = await generateText({
    model: vertex('gemini-1.5-pro'),
    prompt: 'What is the weather in New York City? ',
    tools: {
      weather: tool({
        description: 'Get the weather in a location',
        parameters: z.object({
          location: z.string().describe('The location to get the weather for'),
        }),
        execute: async ({ location }) => {
          console.log('Getting weather for', location);
          return {
            location,
            temperature: 72 + Math.floor(Math.random() * 21) - 10,
          };
        },
      }),
    },
    maxSteps: 5,
  });

  console.log(text);
}

main().catch(console.error);
