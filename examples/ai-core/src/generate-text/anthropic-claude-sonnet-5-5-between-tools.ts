import { type AnthropicProviderOptions, anthropic } from '@ai-sdk/anthropic';
import { generateText, stepCountIs, tool } from 'ai';
import 'dotenv/config';
import { z } from 'zod';

async function main() {
  // `between_tools` is the lowest thinking setting on Sonnet 5.5: no upfront
  // thinking, but progress notes between tool calls come back as summarized
  // thinking blocks. It is accepted at 'low', 'medium', and 'high' effort.
  const result = await generateText({
    model: anthropic('claude-sonnet-5-5'),
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
        thinking: { type: 'between_tools' },
        effort: 'low',
      } satisfies AnthropicProviderOptions,
    },
  });

  for (const [index, step] of result.steps.entries()) {
    console.log(`Step ${index} reasoning:`, step.reasoningText);
  }
  console.log();

  console.log('Text:');
  console.log(result.text);
  console.log();

  console.log('Usage:', result.usage);
  console.log('Warnings:', result.warnings);
}

main().catch(console.error);
