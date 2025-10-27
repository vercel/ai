import { anthropic } from '@ai-sdk/anthropic';
import { Output, stepCountIs, streamText, tool } from 'ai';
import { run } from '../lib/run';
import z from 'zod';

run(async () => {
  const { partialOutputStream } = await streamText({
    model: anthropic('claude-haiku-4-5-20251001'),
    stopWhen: stepCountIs(3),
    prompt:
      'Get the weather for Berlin and Paris, then provide a structured response with the cities and their weather.',
    output: Output.object({
      schema: z.object({
        cities: z.array(
          z.object({
            name: z.string().describe('The city name'),
            country: z.string().describe('The country'),
            weather: z.string().describe('Current weather condition'),
            temperature: z.number().describe('Temperature in Celsius'),
            population: z
              .number()
              .optional()
              .describe('Population of the city if available'),
          }),
        ),
        summary: z.string().describe('A brief summary of the weather report'),
      }),
    }),
    tools: {
      getWeather: tool({
        description: 'Get the current weather in a location',
        inputSchema: z.object({
          location: z.string().describe('The city name'),
        }),
        execute: async ({ location }) => ({
          location,
          weather: location === 'Berlin' ? 'sunny' : 'rainy',
          temperature: location === 'Berlin' ? 22 : 18,
        }),
      }),
      getPopulation: tool({
        description: 'Get the population of a city',
        inputSchema: z.object({
          city: z.string().describe('The city name'),
        }),
        execute: async ({ city }) => ({
          city,
          population:
            city === 'Berlin' ? 3850000 : city === 'Paris' ? 2161000 : 1000000,
        }),
      }),
    },
  });
  for await (const partialOutput of partialOutputStream) {
    console.clear();
    console.log(partialOutput);
  }
});
