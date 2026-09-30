import { type AnthropicProviderOptions, anthropic } from '@ai-sdk/anthropic';
import { generateText, stepCountIs, tool } from 'ai';
import 'dotenv/config';
import { z } from 'zod';

async function main() {
  const result = await generateText({
    model: anthropic('claude-fable-5-1'),
    prompt: 'What is the weather in Paris, and what should I wear?',
    stopWhen: stepCountIs(3),
    tools: {
      getWeather: tool({
        description: 'Get the current weather for a city.',
        inputSchema: z.object({ city: z.string() }),
        execute: async ({ city }) => ({
          city,
          temperatureCelsius: 18,
          condition: 'light rain',
        }),
      }),
    },
    providerOptions: {
      anthropic: {
        thinking: {
          type: 'adaptive',
          display: 'updates',
          blockBinding: {
            prefixMismatchBehavior: 'drop_block',
          },
        },
      } satisfies AnthropicProviderOptions,
    },
  });

  console.log('Reasoning:', result.reasoning);
  console.log('Text:', result.text);
  console.log('Warnings:', result.warnings);
}

main().catch(console.error);
