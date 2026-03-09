import { openai } from '@ai-sdk/openai';
import { generateText, tool } from 'ai';
import { z } from 'zod';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: openai('gpt-4o'),
    tools: {
      weather: tool({
        description: 'Get the weather in a location',
        inputSchema: z.object({
          location: z.string().describe('The location to get the weather for'),
        }),
        contextSchema: z.object({
          weatherApiKey: z.string().describe('The API key for the weather API'),
        }),
        execute: async ({ location }, { experimental_context: context }) => {
          console.log(context);

          context satisfies { weatherApiKey: string };

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
        execute: async ({ expression }, { experimental_context: context }) => {
          console.log(context);
          return {
            expression,
            result: eval(expression),
          };
        },
      }),
    },
    experimental_context: {
      weatherApiKey: '123',
      calculatorApiKey: '456',
      somethingElse: 'context',
    },
    prepareStep: async ({ experimental_context: context }) => {
      console.log(context);
      return {};
    },
    prompt: 'What is the weather in San Francisco?',
  });

  console.log(JSON.stringify(result.toolResults, null, 2));
});
