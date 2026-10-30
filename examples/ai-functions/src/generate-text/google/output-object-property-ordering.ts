import { google } from '@ai-sdk/google';
import { generateText, Output } from 'ai';
import { z } from 'zod/v4';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: google('gemini-3.8-flash'),
    output: Output.object({
      schema: z
        .object({
          answer: z.number(),
          reasoning: z.string(),
        })
        .meta({ propertyOrdering: ['reasoning', 'answer'] }),
    }),
    prompt:
      'A train leaves at 9:40 and arrives at 13:15. How many minutes is the trip?',
  });

  console.log(result.text);
  console.log(result.output);
});
