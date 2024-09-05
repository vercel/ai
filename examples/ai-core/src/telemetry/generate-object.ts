import 'dotenv/config';

import { openai } from '@ai-sdk/openai';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-node';
import { generateObject } from 'ai';
import { z } from 'zod';

const sdk = new NodeSDK({
  traceExporter: new ConsoleSpanExporter(),
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();

async function main() {
  const result = await generateObject({
    model: openai('gpt-4o-mini', { structuredOutputs: true }),
    schema: z.object({
      recipe: z.object({
        name: z.string(),
        ingredients: z.array(
          z.object({
            name: z.string(),
            amount: z.string(),
          }),
        ),
        steps: z.array(z.string()),
      }),
    }),
    prompt: 'Generate a lasagna recipe.',
    experimental_telemetry: {
      isEnabled: true,
      functionId: 'my-awesome-function',
      metadata: {
        something: 'custom',
        someOtherThing: 'other-value',
      },
    },
  });

  console.log(JSON.stringify(result.object.recipe, null, 2));

  await sdk.shutdown();
}

main().catch(console.error);
