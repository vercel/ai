import { anthropic, createAnthropic } from '@ai-sdk/anthropic';
import { generateText, isStepCount, registerTelemetryIntegration } from 'ai';
import { OpenTelemetry } from '@ai-sdk/otel';
import { LangfuseSpanProcessor } from '@langfuse/otel';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { run } from '../../lib/run';
import { z } from 'zod';

const sdk = new NodeSDK({
  spanProcessors: [new LangfuseSpanProcessor()],
});

sdk.start();
registerTelemetryIntegration(new OpenTelemetry());

run(async () => {
  const myCustomProvider = createAnthropic({
    name: 'my-anthropic-proxy',
  });

  const result = await generateText({
    model: anthropic('claude-sonnet-4-5-20250929'),
    prompt: 'what is the weather in Tokyo?',
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
    reasoning: 'medium',
    stopWhen: isStepCount(5),
    experimental_telemetry: {
      functionId: 'anthropic-custom-provider-demo',
    },
  });

  console.log('Reasoning:');
  console.log(result.reasoning);
  console.log();
  console.log('Text:');
  console.log(result.text);

  await sdk.shutdown();
});
