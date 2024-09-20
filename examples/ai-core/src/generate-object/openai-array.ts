import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import 'dotenv/config';
import { z } from 'zod';

async function main() {
  const result = await generateObject({
    model: openai('gpt-4o-2024-08-06', {
      structuredOutputs: true,
    }),
    output: 'array',
    schema: z.object({
      name: z.string(),
      class: z
        .string()
        .describe('Character class, e.g. warrior, mage, or thief.'),
      description: z.string(),
    }),
    prompt: 'Generate 3 hero descriptions for a fantasy role playing game.',
  });

  console.log(JSON.stringify(result.object, null, 2));
  console.log();
  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
}

main().catch(console.error);
