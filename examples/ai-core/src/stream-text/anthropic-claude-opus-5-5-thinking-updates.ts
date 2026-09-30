import { type AnthropicProviderOptions, anthropic } from '@ai-sdk/anthropic';
import { stepCountIs, streamText, tool } from 'ai';
import 'dotenv/config';
import { z } from 'zod';

async function main() {
  // Opus 5.5 returns progress notes between tool calls as thinking blocks.
  // `display: 'updates'` streams a short summary of each note.
  const result = streamText({
    model: anthropic('claude-opus-5-5'),
    prompt:
      'Compare the weather in San Francisco and New York, then recommend where to hold an outdoor event.',
    stopWhen: stepCountIs(5),
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
        },
      } satisfies AnthropicProviderOptions,
    },
  });

  for await (const part of result.fullStream) {
    if (part.type === 'reasoning-delta') {
      process.stdout.write(`\x1b[34m${part.text}\x1b[0m`);
    } else if (part.type === 'text-delta') {
      process.stdout.write(part.text);
    } else if (part.type === 'tool-call') {
      console.log(`\nTool call: ${part.toolName}`);
    }
  }

  console.log();
  console.log('Warnings:', await result.warnings);
}

main().catch(console.error);
