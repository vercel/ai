import { createAnthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import { LangfuseSpanProcessor } from '@langfuse/otel';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { run } from '../lib/run';

const sdk = new NodeSDK({
  spanProcessors: [new LangfuseSpanProcessor()],
});

sdk.start();

run(async () => {
  const myCustomProvider = createAnthropic({
    name: 'my-anthropic-proxy',
  });

  const result = await generateText({
    model: myCustomProvider('claude-sonnet-4-5'),
    prompt: 'Say hello in 5 words',
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

  console.log(result.text);

  await sdk.shutdown();
});
