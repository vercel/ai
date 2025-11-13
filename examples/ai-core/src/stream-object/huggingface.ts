import { huggingface } from '@ai-sdk/huggingface';
import { streamObject } from 'ai';
import 'dotenv/config';
import { z } from 'zod/v4';

async function main() {
  const result = streamObject({
    model: huggingface.responses('moonshotai/Kimi-K2-Instruct'),
    schema: z.object({
      cities: z.array(
        z.object({
          name: z.string(),
          country: z.string(),
          population: z.number(),
        }),
      ),
    }),
    prompt:
      'Generate a list of 3 major cities with their populations. IN JSON FORMAT',
  });

  // Stream partial objects
  for await (const partialObject of result.partialObjectStream) {
    console.log('Partial object:', partialObject);
  }

  // Get final result
  const finalObject = await result.object;
  const usage = await result.usage;

  console.log('\nFinal object:', finalObject);
  console.log('\nToken usage:', usage);
  console.log('Finish reason:', await result.finishReason);
}

main().catch(console.error);
