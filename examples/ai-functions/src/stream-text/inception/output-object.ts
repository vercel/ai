import { inception } from '@ai-sdk/inception';
import { Output, streamText } from 'ai';
import { z } from 'zod';
import { run } from '../../lib/run';

run(async () => {
  const result = streamText({
    model: inception('mercury-3'),
    output: Output.object({
      schema: z.object({
        recipe: z.object({
          name: z.string(),
          ingredients: z.array(z.string()),
          steps: z.array(z.string()),
        }),
      }),
    }),
    prompt: 'Generate a simple vegetarian lasagna recipe for 4 people.',
  });

  for await (const partialOutput of result.partialOutputStream) {
    console.log(partialOutput);
  }
  console.log('Final output:', await result.output);
  console.log('Token usage:', await result.usage);
});
