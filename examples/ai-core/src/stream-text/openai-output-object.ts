import { openai } from '@ai-sdk/openai';
import { stepCountIs, Output, streamText, tool } from 'ai';
import 'dotenv/config';
import { z } from 'zod/v4';

async function main() {
  const { experimental_partialOutputStream: partialOutputStream } = streamText({
    model: openai('gpt-4o-mini'),
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
        elements: z.array(
          z.object({
            location: z.string(),
            temperature: z.number(),
            touristAttraction: z.string(),
          }),
        ),
      }),
    }),
    stopWhen: stepCountIs(2),
    prompt:
      'What is the weather and the main tourist attraction in San Francisco, London Paris, and Berlin?',
  });

  // [{ location: 'San Francisco', temperature: 81 }, ...]
  for await (const partialOutput of partialOutputStream) {
    console.clear();
    console.log(partialOutput);
  }
}

main().catch(console.error);
