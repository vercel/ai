import 'dotenv/config';
import { generateText, Output } from 'ai';
import { xai } from '@ai-sdk/xai';
import { z } from 'zod';

async function main() {
  const { experimental_output } = await generateText({
    model: xai('grok-3-beta'),
    experimental_output: Output.object({
      schema: z.object({
        name: z.string(),
        age: z.number().nullable().describe('Age of the person.'),
        contact: z.object({
          type: z.literal('email'),
          value: z.string(),
        }),
        occupation: z.object({
          type: z.literal('employed'),
          company: z.string(),
          position: z.string(),
        }),
      }),
    }),
    prompt: 'Generate an example person for testing.',
  });
}

main().catch(console.error);
