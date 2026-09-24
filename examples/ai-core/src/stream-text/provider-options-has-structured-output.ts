import type { GatewayProviderOptions } from '@ai-sdk/gateway';
import { Output, streamText } from 'ai';
import { z } from 'zod';
import { run } from '../lib/run';

run(async () => {
  const result = streamText({
    model: 'anthropic/claude-sonnet-5',
    providerOptions: {
      gateway: {
        has: ['structured-output'],
      } satisfies GatewayProviderOptions,
    },
    experimental_output: Output.object({
      schema: z.object({
        city: z.string(),
        country: z.string(),
        population: z.number(),
      }),
    }),
    prompt: 'Describe the largest city in Japan.',
  });

  for await (const partialOutput of result.experimental_partialOutputStream) {
    console.clear();
    console.log(partialOutput);
  }

  console.log();
  console.log('Token usage:', await result.usage);
});
