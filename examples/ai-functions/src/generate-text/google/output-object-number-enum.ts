import { google } from '@ai-sdk/google';
import { generateText, Output } from 'ai';
import { z } from 'zod';
import { run } from '../../lib/run';

// Reproduction for number enums in schemas: the Gemini API only allows
// enum on string types (https://github.com/vercel/ai/issues/6872), so
// numeric enum/literal values are moved into the schema description
// while keeping the declared number type.
run(async () => {
  const { output } = await generateText({
    model: google('gemini-2.5-flash'),
    output: Output.object({
      schema: z.object({
        name: z.string(),
        rating: z
          .union([z.literal(1), z.literal(2), z.literal(3)])
          .describe('Rating from 1 to 3.'),
        priority: z.literal(5),
      }),
    }),
    prompt: 'Generate an example review for testing.',
  });

  console.log(output);
});
