import { anthropic } from '@ai-sdk/anthropic';
import { generateText, tool } from 'ai';
import 'dotenv/config';
import { z } from 'zod/v4';

async function main() {
  const result = await generateText({
    model: anthropic('claude-3-5-haiku-latest'),
    tools: {
      cityAttractions: tool({
        inputSchema: z.object({ city: z.string() }),
        providerOptions: {
          anthropic: {
            cacheControl: { type: 'ephemeral' },
          },
        },
      }),
    },
    prompt: 'What attractions should I visit in San Francisco?',
  });

  console.log(JSON.stringify(result.request.body, null, 2));
}

main().catch(console.error);
