import { xai } from '@ai-sdk/xai';
import { generateObject } from 'ai';
import { z } from 'zod';
import { run } from '../lib/run';

run(async () => {
  const result = await generateObject({
    model: xai('grok-3-beta'),
    schemaName: 'recipe',
    schemaDescription: 'A recipe for lasagna.',
    schema: z.object({
      name: z.string(),
      ingredients: z.array(
        z.object({
          name: z.string(),
          amount: z.string(),
        }),
      ),
      steps: z.array(z.string()),
    }),
    prompt: 'Generate a lasagna recipe.',
  });

  console.log(JSON.stringify(result.object, null, 2));
  console.log();
  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
});
