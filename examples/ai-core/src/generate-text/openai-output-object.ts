import { openai } from '@ai-sdk/openai';
import { generateText, Output } from 'ai';
import 'dotenv/config';
import { z } from 'zod';
import { zodSchema } from '../../../../packages/ui-utils/dist';

async function main() {
  const { text, usage, experimental_object } = await generateText({
    model: openai('gpt-3.5-turbo'),
    prompt: 'Invent a new holiday and describe its traditions.',
    experimental_output: Output.object({
      schema: z.object({
        holiday: z.string(),
        traditions: z.array(z.string()),
      }),
    }),
  });

  console.log(experimental_object);
  console.log();
  console.log('Usage:', usage);
}

main().catch(console.error);
