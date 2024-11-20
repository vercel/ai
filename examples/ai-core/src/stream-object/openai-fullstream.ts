import { openai } from '@ai-sdk/openai';
import { streamObject } from 'ai';
import 'dotenv/config';
import { z } from 'zod';

async function main() {
  const result = streamObject({
    model: openai('gpt-4-turbo', { logprobs: 2 }),
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
    mode: 'json',
    prompt:
      'Generate 3 character descriptions for a fantasy role playing game.',
  });

  for await (const part of result.fullStream) {
    switch (part.type) {
      case 'object':
        console.clear();
        console.log(part.object);
        break;

      case 'finish': {
        console.log('Finish reason:', part.finishReason);
        console.log('Logprobs:', part.logprobs);
        console.log('Usage:', part.usage);
        break;
      }

      case 'error':
        console.error('Error:', part.error);
        break;
    }
  }
}

main().catch(console.error);
