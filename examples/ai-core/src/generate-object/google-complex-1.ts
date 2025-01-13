import { google } from '@ai-sdk/google';
import { generateObject } from 'ai';
import 'dotenv/config';
import { z } from 'zod';

async function main() {
  const Product = z.object({
    name: z.string(),
    category: z.string(),
    description: z.string(),
    key_ingredients: z.string(),
    usage_instructions: z.string(),
    precautions: z.string(),
  });

  const Prescription = z.object({
    morning_routines: z.array(Product),
    evening_routines: z.array(Product),
    lifestyle_changes: z.array(z.string()),
    treatment_notes: z.string(),
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
