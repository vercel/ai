import { openai } from '@ai-sdk/openai';
import { generateText, tool } from 'ai';
import 'dotenv/config';
import { z } from 'zod';
import { weatherTool } from '../tools/weather-tool';

async function main() {
  const { text, reasoning, toolCalls, usage } = await generateText({
    model: openai('gpt-5'),
    tools: {
      weather: weatherTool,
      calculator: tool({
        description: 'Calculate mathematical expressions',
        parameters: z.object({
          expression: z
            .string()
            .describe('The mathematical expression to calculate'),
        }),
        execute: async ({ expression }) => {
          try {
            const result = eval(expression);
            return { expression, result };
          } catch (error) {
            return { expression, error: 'Invalid expression' };
          }
        },
      }),
    },
    prompt:
      'What is the weather in San Francisco? Then calculate how many days are in 3 weeks.',
    maxTokens: 1000,
  });

  console.log('Text:', text);
  console.log('\nReasoning:', reasoning);
  console.log('\nTool Calls:', toolCalls);
  console.log('\nUsage:', usage);
}

main().catch(console.error);
