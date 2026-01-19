import { bedrockAnthropic } from '@ai-sdk/amazon-bedrock/anthropic';
import { generateObject } from 'ai';
import 'dotenv/config';
import { z } from 'zod';
import { run } from '../lib/run';

run(async () => {
  const result = await generateObject({
    model: bedrockAnthropic('us.anthropic.claude-3-5-sonnet-20241022-v2:0'),
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

  console.log('Recipe:', JSON.stringify(result.object, null, 2));
  console.log();
  console.log('Finish reason:', result.finishReason);
  console.log('Usage:', result.usage);
});
