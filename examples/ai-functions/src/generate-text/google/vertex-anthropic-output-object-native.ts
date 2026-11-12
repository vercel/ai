import { createGoogleVertexAnthropic } from '@ai-sdk/google-vertex/anthropic';
import { generateText, Output } from 'ai';
import { z } from 'zod/v4';
import { run } from '../../lib/run';

run(async () => {
  // Configure Google Cloud's structured_outputs policy for this model first.
  const vertexAnthropic = createGoogleVertexAnthropic({
    supportsNativeStructuredOutput: true,
  });

  const result = await generateText({
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

  console.log('Recipe:', result.output);
  console.log('Token usage:', result.usage);
});
