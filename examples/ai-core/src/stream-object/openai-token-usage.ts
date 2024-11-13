import { openai } from '@ai-sdk/openai';
import { streamObject, LanguageModelUsage } from 'ai';
import 'dotenv/config';
import { z } from 'zod';

async function main() {
  const result = streamObject({
    model: openai('gpt-4-turbo'),
    schema: z.object({
      recipe: z.object({
        name: z.string(),
        ingredients: z.array(z.string()),
        steps: z.array(z.string()),
      }),
    }),
    prompt: 'Generate a lasagna recipe.',
  });

  // your custom function to record usage:
  function recordUsage({
    promptTokens,
    completionTokens,
    totalTokens,
  }: LanguageModelUsage) {
    console.log('Prompt tokens:', promptTokens);
    console.log('Completion tokens:', completionTokens);
    console.log('Total tokens:', totalTokens);
  }

  // use as promise:
  result.usage.then(recordUsage);

  // use with async/await:
  recordUsage(await result.usage);

  // note: the stream needs to be consumed because of backpressure
  for await (const partialObject of result.partialObjectStream) {
  }
}

main().catch(console.error);
