import { openai } from '@ai-sdk/openai';
import { generateText, Output } from 'ai';
import 'dotenv/config';
import { z } from 'zod';

async function main() {
  const { usage, experimental_output } = await generateText({
    model: openai('gpt-4o-mini'), // TODO { structuredOutputs: true }),
    prompt: 'Invent a new holiday and describe its traditions.',
    experimental_output: Output.object({
      schema: z.object({
        holiday: z.string(),
        traditions: z.array(z.string()),
      }),
    }),
  });

  console.log(experimental_output);
  console.log();
  console.log('Usage:', usage);
}

main().catch(console.error);
