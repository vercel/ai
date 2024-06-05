import { openai } from '@ai-sdk/openai';
import { streamObject, TokenUsage } from 'ai';
import { z } from 'zod';

const result = await streamObject({
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

// your custom function to record token usage:
function recordTokenUsage({
  promptTokens,
  completionTokens,
  totalTokens,
}: TokenUsage) {
  console.log('Prompt tokens:', promptTokens);
  console.log('Completion tokens:', completionTokens);
  console.log('Total tokens:', totalTokens);
}

// use as promise:
result.usage.then(recordTokenUsage);

// use with async/await:
recordTokenUsage(await result.usage);
