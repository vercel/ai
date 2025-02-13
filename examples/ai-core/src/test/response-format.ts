import { google } from '@ai-sdk/google';
import { generateObject } from 'ai';
import 'dotenv/config';
import { z } from 'zod';

async function main() {
  const result = await generateObject({
    model: google('gemini-2.0-flash', { structuredOutputs: true }),
    prompt: 'Generate a JSON object',
    schema: z.object({
      locator: z.array(z.union([z.string(), z.number()])),
    }),
    maxRetries: 0,
  });

  console.log(JSON.stringify(result.object, null, 2));
}

main().catch(error => {
  console.error(JSON.stringify(error, null, 2));
});
