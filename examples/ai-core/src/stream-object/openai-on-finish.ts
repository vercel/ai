import { openai } from '@ai-sdk/openai';
import { streamObject } from 'ai';
import 'dotenv/config';
import { z } from 'zod';

async function main() {
  const result = streamObject({
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
    onFinish({ usage, object, error }) {
      console.log();
      console.log('onFinish');
      console.log('Token usage:', usage);

      // handle type validation failure (when the object does not match the schema):
      if (object === undefined) {
        console.error('Error:', error);
      } else {
        console.log('Final object:', JSON.stringify(object, null, 2));
      }
    },
  });

  // consume the partialObjectStream:
  for await (const partialObject of result.partialObjectStream) {
  }
}

main().catch(console.error);
