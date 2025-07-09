import { vercel } from '@ai-sdk/vercel';
import { streamObject } from 'ai';
import 'dotenv/config';
<<<<<<< HEAD
import { z } from 'zod';
=======
import { z } from 'zod/v4';
>>>>>>> ffac5e5f564b670187256f9adb84a0095255e1f9

async function main() {
  const result = streamObject({
    model: vercel('v0-1.0-md'),
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
  });

  for await (const partialObject of result.partialObjectStream) {
    console.clear();
    console.log(partialObject);
  }

  console.log();
  console.log('Token usage:', await result.usage);
}

main().catch(console.error);
