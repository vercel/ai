import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { gemmaToolMiddleware, generateText, wrapLanguageModel } from 'ai';
import { z } from 'zod';

const openrouter = createOpenAICompatible({
  name: 'openrouter',
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
});

async function main() {
  await generateText({
    model: wrapLanguageModel({
      model: openrouter('google/gemma-3-27b-it'),
      middleware: gemmaToolMiddleware,
    }),
    system: 'You are a helpful assistant.',
    prompt: 'What is the weather in New York and Los Angeles?',
    maxSteps: 4,
    tools: {
      get_weather: {
        description:
          'Get the weather for a given city. ' +
          "Example cities: 'New York', 'Los Angeles', 'Paris'.",
        parameters: z.object({ city: z.string() }),
        execute: async ({ city }) => {
          // Simulate a weather API call
          const temperature = Math.floor(Math.random() * 100);
          return {
            city,
            temperature,
            condition: 'sunny',
          };
        },
      },
    },
    onStepFinish: step => {
      console.log({
        text: step.text,
        toolCalls: step.toolCalls.map(
          call => `name: ${call.toolName}, args: ${JSON.stringify(call.args)}`,
        ),
        toolResults: step.toolResults.map(result =>
          JSON.stringify(result.result),
        ),
      });
    },
  });
}

main().catch(console.error);
