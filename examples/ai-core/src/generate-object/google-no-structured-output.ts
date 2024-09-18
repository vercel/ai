import { google } from '@ai-sdk/google';
import { generateObject } from 'ai';
import 'dotenv/config';
import { z } from 'zod';

async function main() {
  const result = await generateObject({
    model: google('gemini-1.5-pro-latest', {
      structuredOutputs: false,
    }),
    schema: z.object({
      name: z.string(),
      age: z.number(),
      contact: z.union([
        z.object({
          type: z.literal('email'),
          value: z.string(),
        }),
        z.object({
          type: z.literal('phone'),
          value: z.string(),
        }),
      ]),
      occupation: z.union([
        z.object({
          type: z.literal('employed'),
          company: z.string(),
          position: z.string(),
        }),
        z.object({
          type: z.literal('student'),
          school: z.string(),
          grade: z.number(),
        }),
        z.object({
          type: z.literal('unemployed'),
        }),
      ]),
    }),
    prompt: 'Generate an example person for testing.',
  });

  console.log(JSON.stringify(result.object, null, 2));
  console.log();
  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
}

main().catch(console.error);
