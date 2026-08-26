import { google } from '@ai-sdk/google';
import { generateText, tool } from 'ai';
import { z } from 'zod';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: google('gemini-2.5-flash'),
    tools: {
      lookupInvoice: tool({
        description: 'Look up an invoice by price.',
        inputSchema: z.object({
          price: z.number().positive().multipleOf(0.5),
        }),
      }),
    },
    prompt: 'Look up the invoice priced at $12.50.',
  });

  console.log(JSON.stringify(result.warnings, null, 2));
});
