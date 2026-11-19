import { createGoogleVertexAnthropic } from '@ai-sdk/google-vertex/anthropic';
import { Output, streamText } from 'ai';
import { z } from 'zod/v4';
import { run } from '../../lib/run';

run(async () => {
  // Configure Google Cloud's structured_outputs policy for this model first.
  const vertexAnthropic = createGoogleVertexAnthropic({
    supportsNativeStructuredOutput: true,
  });

  const result = streamText({
    model: vertexAnthropic('claude-sonnet-4-6'),
    output: Output.object({
      schema: z.object({
        name: z.string(),
        ingredients: z.array(z.string()),
        steps: z.array(z.string()),
      }),
    }),
    prompt: 'Create a vegetarian lasagna recipe.',
  });

  for await (const partialOutput of result.partialOutputStream) {
    console.log(partialOutput);
  }
  console.log('Recipe:', await result.output);
});
