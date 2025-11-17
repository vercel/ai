import { createGoogleGenerativeAI } from '@ai-sdk/google';
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
  const myCustomProvider = createGoogleGenerativeAI({
    name: 'my-custom-provider',
  });

  await generateText({
    model: myCustomProvider('gemini-2.5-flash'),
    prompt: 'Say hello in 5 words',
    experimental_telemetry: {
      isEnabled: true,
      functionId: 'custom-provider-demo',
      metadata: {
        environment: 'demo',
        customer_id: 'demo-user',
        request_source: 'example',
      },
    },
  });

  await sdk.shutdown();
}

main().catch(console.error);
