import { anthropic } from '@ai-sdk/anthropic';
import { generateObject } from 'ai';
import { z } from 'zod';
import { run } from '../lib/run';

run(async () => {
  const result = await generateObject({
    model: anthropic('claude-sonnet-4-5'),
    providerOptions: {
      anthropic: {
        structuredOutputMode: 'outputFormat',
      },
    },
    schema: z.object({
      recurringIntervalMinutes: z.number().int().min(0).max(40),
    }),
    prompt:
      'Return a JSON object with recurringIntervalMinutes set to a positive number.',
  });

  console.dir(result.request.body, { depth: Infinity });
  console.log();
  console.log(JSON.stringify(result.object, null, 2));
});
