import 'dotenv/config';
import { googleVertexAnthropic } from '@ai-sdk/google-vertex/anthropic';
import { streamObject } from 'ai';
import { z } from 'zod';

async function main() {
  const result = streamObject({
    model: googleVertexAnthropic('claude-3-5-sonnet-20240620'),
    maxTokens: 2000,
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
}

main().catch(console.error);