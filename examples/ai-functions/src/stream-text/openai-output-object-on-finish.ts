import { openai } from '@ai-sdk/openai';
import { Output, streamText } from 'ai';
import { z } from 'zod';
import { run } from '../lib/run';

run(async () => {
  const result = streamText({
    model: openai('gpt-4o-mini'),
    output: Output.object({
      schema: z.object({
        recipe: z.object({
          name: z.string(),
          ingredients: z.array(
            z.object({ name: z.string(), amount: z.string() }),
          ),
          steps: z.array(z.string()),
        }),
      }),
    }),
    prompt: 'Generate a lasagna recipe.',
    onFinish({ output, outputError, usage, finishReason }) {
      console.log();
      console.log('onFinish');
      console.log('Finish reason:', finishReason);
      console.log('Token usage:', usage);

      if (outputError) {
        console.log('Output parsing error:', outputError);
      } else {
        console.log('Parsed output:', JSON.stringify(output, null, 2));
      }
    },
  });

  for await (const partialOutput of result.partialOutputStream) {
    console.clear();
    console.log(partialOutput);
  }
});
