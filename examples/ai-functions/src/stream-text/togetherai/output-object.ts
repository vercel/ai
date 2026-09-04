import { togetherai } from '@ai-sdk/togetherai';
import { Output, streamText } from 'ai';
import { z } from 'zod';
import { run } from '../../lib/run';

run(async () => {
  const result = streamText({
    model: togetherai.chatModel('deepseek-ai/DeepSeek-V4-Flash-0731'),
    output: Output.object({
      schema: z.object({
        characters: z.array(
          z.object({
            name: z.string(),
            class: z
              .string()
              .describe('Character class, e.g. warrior, mage, or thief.'),
            description: z.string(),
          }),
        ),
      }),
    }),
    prompt:
      'Generate 3 fantasy role playing game characters. Return only JSON with a characters array whose items contain a name, class, and description.',
  });

  for await (const partialOutput of result.partialOutputStream) {
    console.clear();
    console.log(partialOutput);
  }

  console.log();
  console.log('Token usage:', await result.usage);
});
