import { anthropic } from '@ai-sdk/anthropic';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-node';
import { streamText, registerTelemetryIntegration } from 'ai';
import { OpenTelemetryIntegration } from '@ai-sdk/otel';
import { run } from '../lib/run';

const sdk = new NodeSDK({
  traceExporter: new ConsoleSpanExporter(),
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();
registerTelemetryIntegration(new OpenTelemetryIntegration());

run(async () => {
  const result = streamText({
    model: anthropic('claude-3-5-sonnet-20240620'),
    maxOutputTokens: 50,
    prompt: 'Invent a new holiday and describe its traditions.',
    runtimeContext: {
      something: 'custom',
      someOtherThing: 'other-value',
    },
    experimental_telemetry: {
      functionId: 'my-awesome-function',
    },
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  await sdk.shutdown();
});
