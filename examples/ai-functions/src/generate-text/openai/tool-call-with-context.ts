import { openai } from '@ai-sdk/openai';
import { generateText, tool } from 'ai';
import { z } from 'zod';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: openai('gpt-5-mini'),
    tools: {
      weather: tool({
        description: 'Get the weather in a location',
        inputSchema: z.object({
          location: z.string().describe('The location to get the weather for'),
        }),
        contextSchema: z.object({
          weatherApiKey: z.string().describe('The API key for the weather API'),
        }),
        execute: async ({ location }, { context: { weatherApiKey } }) => {
          console.log('weather tool api key:', weatherApiKey);

          return {
            location,
            temperature: 72 + Math.floor(Math.random() * 21) - 10,
          };
        },
      }),
      calculator: tool({
        description: 'Calculate mathematical expressions',
        inputSchema: z.object({
          expression: z
            .string()
            .describe('The mathematical expression to calculate'),
        }),
        contextSchema: z.object({
          calculatorApiKey: z
            .string()
            .describe('The API key for the calculator API'),
        }),
        execute: async ({ expression }, { context: { calculatorApiKey } }) => {
          console.log('calculator tool api key:', calculatorApiKey);
          return {
            expression,
            result: eval(expression),
          };
        },
      }),
    },
    context: {
      weatherApiKey: 'weather-123',
      calculatorApiKey: 'calculator-456',
      somethingElse: 'other-context',
    },
    prepareStep: async ({ context }) => {
      console.log('prepareStep context:', context);
      return {};
    },
    prompt: 'What is the weather in San Francisco?',
  });

  console.log(JSON.stringify(result.toolResults, null, 2));
});
