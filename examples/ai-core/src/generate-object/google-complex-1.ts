import { google } from '@ai-sdk/google';
import { generateObject } from 'ai';
import 'dotenv/config';
import { z } from 'zod';

async function main() {
  const Product = z.object({ name: z.string() });
  const Prescription = z.object({
    morning: z.array(Product),
    evening: z.array(Product),
  });

  const result = await generateObject({
    model: google('gemini-exp-1206'),
    schema: Prescription,
    prompt:
      'Generate a prescription for a patient with a history of ' +
      'chronic pain and anxiety.',
  });

  console.log(JSON.stringify(result.object, null, 2));
  console.log();
  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
}

main().catch(console.error);
