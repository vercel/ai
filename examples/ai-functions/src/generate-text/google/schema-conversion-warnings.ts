import { google } from '@ai-sdk/google';
import { generateText, tool } from 'ai';
import { z } from 'zod';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: google('gemini-2.5-flash'),
    tools: {
      lookupInvoice: tool({
        description: 'Look up an invoice by its two-letter code.',
        inputSchema: z.object({
          code: z.string().regex(/^[A-Z]{2}$/),
        }),
      }),
    },
    prompt: 'Look up invoice AB.',
  });

  console.log(JSON.stringify(result.warnings, null, 2));
});
