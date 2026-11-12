import { inception } from '@ai-sdk/inception';
import { generateText, Output } from 'ai';
import { z } from 'zod';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: inception('mercury-3'),
    output: Output.object({
      schema: z.object({
        sentiment: z.enum(['positive', 'negative', 'neutral']),
        confidence: z.number().min(0).max(1),
        keyPhrases: z.array(z.string()),
      }),
    }),
    prompt:
      'Analyze the sentiment: I love this feature! It saves me so much time.',
  });

  console.log(JSON.stringify(result.output, null, 2));
  console.log('Token usage:', result.usage);
});
