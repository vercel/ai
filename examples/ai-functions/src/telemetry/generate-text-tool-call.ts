import { openai } from '@ai-sdk/openai';
import { generateText, tool } from 'ai';
import { z } from 'zod';
import { weatherTool } from '../tools/weather-tool';

import { NodeSDK } from '@opentelemetry/sdk-node';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { run } from '../lib/run';

const sdk = new NodeSDK({
  traceExporter: new ConsoleSpanExporter(),
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();

run(async () => {
  const result = await generateText({
    model: openai('gpt-3.5-turbo'),
    maxOutputTokens: 512,
    tools: {
      weather: weatherTool,
      cityAttractions: tool({
        inputSchema: z.object({ city: z.string() }),
      }),
    },
    prompt:
      'What is the weather in San Francisco and what attractions should I visit?',
    experimental_telemetry: {
      isEnabled: true,
      functionId: 'my-awesome-function',
      metadata: {
        something: 'custom',
        someOtherThing: 'other-value',
      },
    },
  });

  console.log(JSON.stringify(result, null, 2));

  await sdk.shutdown();
});
