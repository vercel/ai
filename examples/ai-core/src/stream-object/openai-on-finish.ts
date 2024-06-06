import { openai } from '@ai-sdk/openai';
import { streamObject } from 'ai';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

async function main() {
  const result = await streamObject({
    model: openai('gpt-4-turbo'),
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
    prompt:
      'Generate 3 character descriptions for a fantasy role playing game.',
    onFinish({ usage, object, rawResponse, warnings }) {
      console.log();
      console.log('onFinish');
      console.log('Token usage:', usage);
      console.log('Final object:', JSON.stringify(object, null, 2));
    },
  });

  // consume the partialObjectStream:
  for await (const partialObject of result.partialObjectStream) {
  }
}

main().catch(console.error);
