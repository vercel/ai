import 'dotenv/config';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { streamObject } from 'ai';
import { z } from 'zod';

async function main() {
  const togetherai = createOpenAICompatible({
    baseURL: 'https://api.together.xyz/v1',
    name: 'togetherai',
    headers: {
      Authorization: `Bearer ${process.env.TOGETHER_AI_API_KEY}`,
    },
  });
  const model = togetherai.chatModel('mistralai/Mistral-7B-Instruct-v0.1');
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
