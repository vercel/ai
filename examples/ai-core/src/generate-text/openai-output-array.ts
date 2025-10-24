import { openai, OpenAIResponsesProviderOptions } from '@ai-sdk/openai';
import { generateText, Output } from 'ai';
import { z } from 'zod';
import { print } from '../lib/print';
import { run } from '../lib/run';

run(async () => {
  const result = await generateText({
    model: openai('gpt-4o-mini'),
    providerOptions: {
      openai: {
        strictJsonSchema: true,
      } satisfies OpenAIResponsesProviderOptions,
    },
    experimental_output: Output.array({
      element: z.object({
        name: z.string(),
        class: z
          .string()
          .describe('Character class, e.g. warrior, mage, or thief.'),
        description: z.string(),
      }),
    }),
    prompt:
      'Generate 3 character descriptions for a fantasy role playing game.',
  });

  print('Output:', result.experimental_output);
  print('Request:', result.request.body);
});
