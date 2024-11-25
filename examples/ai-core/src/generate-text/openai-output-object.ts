import { openai } from '@ai-sdk/openai';
import { generateText, Output, tool } from 'ai';
import 'dotenv/config';
import { z } from 'zod';

async function main() {
  const { usage, experimental_output } = await generateText({
    model: openai('gpt-4o-mini'), // TODO { structuredOutputs: true }),
    tools: {
      weather: tool({
        description: 'Get the weather in a location',
        parameters: z.object({
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
      }),
    }),
    maxSteps: 2,
    prompt: 'What is the weather in San Francisco?',
  });

  console.log(experimental_output);
  console.log();
  console.log('Usage:', usage);
}

main().catch(console.error);
