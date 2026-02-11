import {
  AnthropicProviderOptions,
  anthropic,
  createAnthropic,
} from '@ai-sdk/anthropic';
import { generateText, stepCountIs } from 'ai';
import { LangfuseSpanProcessor } from '@langfuse/otel';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { run } from '../lib/run';
import { z } from 'zod';

const sdk = new NodeSDK({
  spanProcessors: [new LangfuseSpanProcessor()],
});

sdk.start();

run(async () => {
  const myCustomProvider = createAnthropic({
    name: 'my-anthropic-proxy',
  });

  const result = await generateText({
    model: anthropic('claude-3-7-sonnet-20250219'),
    prompt: 'How many "r"s are in the word "strawberry?',
    tools: {
      getWeather: {
        description: 'Get the weather for a given city',
        inputSchema: z.object({
          city: z.string(),
        }),
        execute: async ({ city }) => {
          return {
            temperature: 50,
            condition: 'sunny',
          };
        },
      },
    },
    providerOptions: {
      anthropic: {
        thinking: { type: 'enabled', budgetTokens: 12000 },
      } satisfies AnthropicProviderOptions,
    },
    stopWhen: stepCountIs(5),
    experimental_telemetry: {
      isEnabled: true,
      functionId: 'anthropic-custom-provider-demo',
      metadata: {
        environment: 'demo',
        endpoint_type: 'my-anthropic-proxy',
        cost_tracking: 'enabled',
      },
    },
  });

  console.log('Reasoning:');
  console.log(result.reasoning);
  console.log();
  console.log('Text:');
  console.log(result.text);

  await sdk.shutdown();
});
