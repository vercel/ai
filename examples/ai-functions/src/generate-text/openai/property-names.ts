import { openai } from '@ai-sdk/openai';
import { generateText, Output } from 'ai';
import { z as z4 } from 'zod/v4';
import { print } from '../../lib/print';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: openai.chat('gpt-4.1-mini'),
    // This disables the separate strict-schema limitation for typed
    // dictionaries, isolating `propertyNames`. Before the OpenAI schema
    // normalization, this request failed with a 400 because Zod emits
    // `propertyNames: { type: 'string' }` for z.record().

    providerOptions: { openai: { strictJsonSchema: false } },
    output: Output.object({
      schema: z4.object({
        variables: z4.record(z4.string(), z4.string()),
      }),
    }),
    prompt: 'Return an object with a variables object containing two strings.',
  });

  print('Output:', result.output);
  print('Warnings:', result.warnings);
});
