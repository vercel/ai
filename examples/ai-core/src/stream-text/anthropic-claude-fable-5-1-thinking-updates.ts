import { type AnthropicProviderOptions, anthropic } from '@ai-sdk/anthropic';
import { stepCountIs, streamText, tool } from 'ai';
import 'dotenv/config';
import { z } from 'zod';

async function main() {
  const result = streamText({
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

  for await (const part of result.fullStream) {
    if (part.type === 'reasoning-delta') {
      process.stdout.write(`\x1b[34m${part.text}\x1b[0m`);
    } else if (part.type === 'text-delta') {
      process.stdout.write(part.text);
    }
  }

  console.log();
  console.log('Warnings:', await result.warnings);
}

main().catch(console.error);
