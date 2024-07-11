import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import dotenv from 'dotenv';

dotenv.config();

import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-node';

const sdk = new NodeSDK({
  traceExporter: new ConsoleSpanExporter(),
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();

async function main() {
  const result = await streamText({
    model: openai('gpt-3.5-turbo'),
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
