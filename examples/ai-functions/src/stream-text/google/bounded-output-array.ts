import { google } from '@ai-sdk/google';
import { Output, streamText } from 'ai';
import { z } from 'zod';
import { run } from '../../lib/run';

run(async () => {
  const result = streamText({
    model: google('gemini-3-flash-preview'),
    output: Output.array({
      element: z.object({
        name: z.string(),
        purpose: z.string(),
      }),
      minItems: 3,
      maxItems: 5,
    }),
    prompt: 'Generate exactly 3 names and purposes for imaginary holidays.',
  });

  for await (const holiday of result.elementStream) {
    console.log(holiday);
  }

  console.log('Validated output:', await result.output);
});
