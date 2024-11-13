import { anthropic } from '@ai-sdk/anthropic';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-node';
import { streamText } from 'ai';
import 'dotenv/config';

const sdk = new NodeSDK({
  traceExporter: new ConsoleSpanExporter(),
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();

async function main() {
  const result = streamText({
    model: anthropic('claude-3-5-sonnet-20240620'),
    maxTokens: 50,
    prompt: 'Invent a new holiday and describe its traditions.',
    experimental_telemetry: {
      isEnabled: true,
      functionId: 'my-awesome-function',
      metadata: {
        something: 'custom',
        someOtherThing: 'other-value',
      },
    },
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  await sdk.shutdown();
}

main().catch(console.error);
