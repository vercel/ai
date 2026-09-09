import { google } from '@ai-sdk/google';
import { generateText, Output } from 'ai';
import { z } from 'zod';
import { print } from '../../lib/print';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: google('gemini-2.5-flash'),
    output: Output.object({
      schema: z.object({
        stringLiteral: z.literal('ready'),
        numberLiteral: z.literal(15),
        booleanLiteral: z.literal(true),
        numberUnion: z.union([z.literal(1), z.literal(2)]),
      }),
    }),
    prompt:
      'Return ready, 15, true, and either 1 or 2 for the matching fields.',
  });

  print('Output:', result.output);
});
