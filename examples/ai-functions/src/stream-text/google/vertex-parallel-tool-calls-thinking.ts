import { type GoogleLanguageModelOptions } from '@ai-sdk/google';
import { vertex } from '@ai-sdk/google-vertex';
import { isStepCount, streamText, tool } from 'ai';
import { z } from 'zod';
import { run } from '../../lib/run';

run(async () => {
  const result = streamText({
    model: vertex('gemini-2.5-flash'),
    providerOptions: {
      vertex: {
        thinkingConfig: { thinkingBudget: 1024 },
      } satisfies GoogleLanguageModelOptions,
    },
    tools: {
      getPopulation: tool({
        description: 'Get the population of a city.',
        inputSchema: z.object({
          city: z.string().describe('The city name'),
        }),
        execute: async ({ city }) => {
          const populations: Record<string, number> = {
            'New York': 8_336_817,
            Tokyo: 13_960_000,
            London: 8_982_000,
            Paris: 2_161_000,
          };
          return {
            city,
            population: populations[city] ?? 1_000_000,
          };
        },
      }),
      getArea: tool({
        description: 'Get the area of a city in square kilometers.',
        inputSchema: z.object({
          city: z.string().describe('The city name'),
        }),
        execute: async ({ city }) => {
          const areas: Record<string, number> = {
            'New York': 783,
            Tokyo: 2_194,
            London: 1_572,
            Paris: 105,
          };
          return {
            city,
            areaSqKm: areas[city] ?? 500,
          };
        },
      }),
      getElevation: tool({
        description: 'Get the elevation of a city in meters above sea level.',
        inputSchema: z.object({
          city: z.string().describe('The city name'),
        }),
        execute: async ({ city }) => {
          const elevations: Record<string, number> = {
            'New York': 10,
            Tokyo: 40,
            London: 11,
            Paris: 35,
          };
          return {
            city,
            elevationMeters: elevations[city] ?? 100,
          };
        },
      }),
    },
    stopWhen: isStepCount(5),
    prompt:
      'Compare the population density of New York and Tokyo. ' +
      'To do this, get the population and area for each city, then calculate the density.',
  });

  for await (const chunk of result.fullStream) {
    switch (chunk.type) {
      case 'text-delta':
        process.stdout.write(chunk.text);
        break;
      case 'tool-call':
        console.log(
          `Tool call: ${chunk.toolName}(${JSON.stringify(chunk.input)})`,
        );
        break;
      case 'tool-result':
        console.log(`Tool result: ${JSON.stringify(chunk.output)}`);
        break;
    }
  }

  console.log('\n\nToken usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
});
