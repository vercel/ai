import { huggingface } from '@ai-sdk/huggingface';
import { generateObject } from 'ai';
import 'dotenv/config';
import { z } from 'zod/v4';

async function main() {
  const result = await generateObject({
    model: huggingface.responses('moonshotai/Kimi-K2-Instruct'),
    schema: z.object({
      name: z.string(),
      age: z.number(),
      email: z.string(),
    }),
    prompt:
      'Generate a simple person profile with name, age, and email. Return only valid JSON.',
  });

  console.log('Generated object:', result.object);
  console.log();
  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
}

main().catch(console.error);
