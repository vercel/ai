import { openai } from '@ai-sdk/openai';
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
  const result = await generateText({
    model: openai('gpt-4o'),
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

  console.log(result.text);

  await sdk.shutdown();
}

main().catch(console.error);
