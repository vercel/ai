import { openai } from '@ai-sdk/openai';
import { generateText, tool } from 'ai';
import 'dotenv/config';
import { z } from 'zod/v4';

async function main() {
  const result = await generateText({
    model: openai('gpt-4o'),
    tools: {
      weather: tool({
        description: 'Get the weather in a location',
        inputSchema: z.object({
          location: z.string().describe('The location to get the weather for'),
        }),
        execute: async ({ location }, { experimental_context: context }) => {
          const typedContext = context as { weatherApiKey: string }; // or use type validation library

          console.log(typedContext);

          return {
            location,
            temperature: 72 + Math.floor(Math.random() * 21) - 10,
          };
        },
      }),
    },
    experimental_context: { weatherApiKey: '123' },
    prompt: 'What is the weather in San Francisco?',
  });

  console.log(JSON.stringify(result.toolResults, null, 2));
}

main().catch(console.error);
