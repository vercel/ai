import { bedrockAnthropic } from '@ai-sdk/amazon-bedrock/anthropic';
import { streamObject } from 'ai';
import 'dotenv/config';
import { z } from 'zod';
import { run } from '../lib/run';

run(async () => {
  const result = streamObject({
    model: bedrockAnthropic('us.anthropic.claude-sonnet-4-5-20250929-v1:0'),
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
    prompt: 'Generate a lasagna recipe.',
  });

  for await (const partialObject of result.partialObjectStream) {
    console.clear();
    console.log('Partial object:', JSON.stringify(partialObject, null, 2));
  }

  console.log('\n--- Final ---');
  console.log('Object:', JSON.stringify(await result.object, null, 2));
  console.log('Finish reason:', await result.finishReason);
  console.log('Usage:', await result.usage);
});
