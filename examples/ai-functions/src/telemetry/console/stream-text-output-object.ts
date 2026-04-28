import { openai } from '@ai-sdk/openai';
import { Output, streamText, registerTelemetry } from 'ai';
import { z } from 'zod';
import { run } from '../../lib/run';
import { consoleTelemetry } from './console-telemetry';

registerTelemetry(consoleTelemetry);

run(async () => {
  const result = streamText({
    model: openai('gpt-4o-mini'),
    output: Output.object({
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
    }),
    prompt: 'Generate a lasagna recipe.',
    runtimeContext: {
      something: 'custom',
      someOtherThing: 'other-value',
    },
    telemetry: {
      functionId: 'my-awesome-function',
    },
  });

  await result.consumeStream();
});
