import { streamText } from 'ai/core';
import { openai } from 'ai/provider';
import dotenv from 'dotenv';
import { weatherTool } from '../tools/weather-tool';
import { z } from 'zod';

dotenv.config();

async function main() {
  const result = await streamText({
    model: openai.chat({ id: 'gpt-3.5-turbo' }),
    tools: {
      weather: {
        description: 'Get the weather in a location',
        parameters: z.object({
          location: z.string().describe('The location to get the weather for'),
        }),
        execute: async ({ location }) => ({
          location,
          temperature: 72 + Math.floor(Math.random() * 21) - 10,
          description:
            Math.random() < 0.33
              ? 'sunny'
              : Math.random() < 0.66
              ? 'cloudy'
              : 'raining',
        }),
      },
    },
    prompt: 'What is the weather in San Francisco?',
  });

  for await (const part of result.fullStream) {
    console.log(JSON.stringify(part, null, 2));
  }
}

main();
