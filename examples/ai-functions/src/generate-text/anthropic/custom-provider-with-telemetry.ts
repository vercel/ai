import { createAnthropic } from '@ai-sdk/anthropic';
import { generateText, registerTelemetryIntegration } from 'ai';
import { OpenTelemetryIntegration } from '@ai-sdk/otel';

import { NodeSDK } from '@opentelemetry/sdk-node';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { run } from '../../lib/run';

const sdk = new NodeSDK({
  traceExporter: new ConsoleSpanExporter(),
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();
registerTelemetryIntegration(new OpenTelemetryIntegration());

run(async () => {
  const myCustomProvider = createAnthropic({
    name: 'my-anthropic-proxy',
  });

  await generateText({
    model: myCustomProvider('claude-sonnet-4-20250514'),
    prompt: 'Say hello in 5 words',
    telemetry: {
      functionId: 'anthropic-custom-provider-demo',
    },
  });

  await sdk.shutdown();
});
