import { anthropic } from '@ai-sdk/anthropic';
import { generateText, Output } from 'ai';
import { z } from 'zod';
import { print } from '../../lib/print';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: 'anthropic/claude-sonnet-4.5',
    output: Output.object({
      schema: z.object({
        recurringIntervalMinutes: z.number().positive(),
      }),
    }),
    prompt:
      'Return a JSON object with recurringIntervalMinutes set to a positive number.',
  });

  print('Output:', result.output);
  print('Request:', result.request.body);
});
