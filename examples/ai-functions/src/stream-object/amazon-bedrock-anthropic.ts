import { bedrockAnthropic } from '@ai-sdk/amazon-bedrock/anthropic';
import { Output, streamText } from 'ai';
import 'dotenv/config';
import { z } from 'zod';
import { run } from '../lib/run';

run(async () => {
  const result = streamText({
    model: bedrockAnthropic('us.anthropic.claude-sonnet-4-5-20250929-v1:0'),
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
  });

  for await (const part of result.fullStream) {
    if (part.type === 'text-delta') {
      process.stdout.write(part.text);
    }
  }

  console.log('\n\n--- Final ---');
  console.log('Output:', JSON.stringify(await result.output, null, 2));
  console.log('Finish reason:', await result.finishReason);
  console.log('Usage:', await result.usage);
});
