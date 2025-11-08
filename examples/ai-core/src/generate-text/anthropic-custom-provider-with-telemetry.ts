import { createAnthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import 'dotenv/config';

import { NodeSDK } from '@opentelemetry/sdk-node';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

const sdk = new NodeSDK({
  traceExporter: new ConsoleSpanExporter(),
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();

async function main() {
  const myCustomProvider = createAnthropic({
    name: 'my-anthropic-proxy',
  });

  await generateText({
    model: myCustomProvider('claude-sonnet-4-20250514'),
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

  await sdk.shutdown();
}

main().catch(console.error);
