import { google } from '@ai-sdk/google';
import { generateObject } from 'ai';
import 'dotenv/config';
import { z } from 'zod';

async function main() {
  const result = await generateObject({
    model: google('gemini-2.0-flash'),
    providerOptions: {
      google: {
        structuredOutputs: true,
      },
    },
    schema: z.object({
      name: z.string(),

      // nullable number with description
      age: z.number().nullable().describe('Age of the person.'),

      // object
      contact: z.object({
        type: z.literal('email'),
        value: z.string(),
      }),

      // nullable enum
      level: z.enum(['L1', 'L2', 'L3']).nullable(),
    }),
    prompt: 'Generate an example person for testing.',
  });

  console.log(JSON.stringify(result.object, null, 2));
  console.log();
  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
}

main().catch(console.error);
