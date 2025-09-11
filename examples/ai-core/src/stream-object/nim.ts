import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { streamObject } from 'ai';
import { z } from 'zod';
import 'dotenv/config';

async function main() {
  const nim = createOpenAICompatible({
    baseURL: 'https://integrate.api.nvidia.com/v1',
    name: 'nim',
    headers: {
      Authorization: `Bearer ${process.env.NIM_API_KEY}`,
    },
  });
  const model = nim.chatModel('meta/llama-3.3-70b-instruct');
  const result = streamObject({
    model,
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
