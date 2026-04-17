import { createGoogleGenerativeAI } from '@ai-sdk/google';
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
  const myCustomProvider = createGoogleGenerativeAI({
    name: 'my-custom-provider',
  });

  await generateText({
    model: myCustomProvider('gemini-2.5-flash'),
    prompt: 'Say hello in 5 words',
    telemetry: {
      functionId: 'custom-provider-demo',
    },
  });

  await sdk.shutdown();
});
