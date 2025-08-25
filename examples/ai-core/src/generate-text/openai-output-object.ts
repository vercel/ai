import { openai } from '@ai-sdk/openai';
import { generateText, stepCountIs, Output, tool } from 'ai';
import 'dotenv/config';
import { z } from 'zod/v4';

async function main() {
  const { experimental_output } = await generateText({
    model: openai('gpt-4o'),
    tools: {
      weather: tool({
        description: 'Get the weather in a location',
        inputSchema: z.object({
          location: z.string().describe('The location to get the weather for'),
        }),
        // location below is inferred to be a string:
        execute: async ({ location }) => ({
          location,
          temperature: 72 + Math.floor(Math.random() * 21) - 10,
        }),
      }),
    },
    experimental_output: Output.object({
      schema: z.object({
        location: z.string(),
        temperature: z.number(),
        suggestions: z.array(z.string()).max(3),
      }),
    }),
    stopWhen: stepCountIs(2),
    prompt: 'What is the weather in San Francisco and what should I wear?',
  });

  // { location: 'San Francisco', temperature: 81, suggestions: ['Wear a jacket', 'Bring an umbrella'] }
  console.log(experimental_output);
}

main().catch(console.error);
