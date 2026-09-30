import 'dotenv/config';
import {
  perplexity,
  type PerplexityLanguageModelOptions,
} from '@ai-sdk/perplexity';
import { generateObject } from 'ai';
import { z } from 'zod';

async function main() {
  const result = await generateObject({
    model: perplexity('low'),
    prompt: 'What has happened in San Francisco recently?',
    providerOptions: {
      perplexity: {
        tools: [
          {
            type: 'web_search',
            filters: { search_recency_filter: 'week' },
          },
        ],
      } satisfies PerplexityLanguageModelOptions,
    },
    output: 'array',
    schema: z.object({
      title: z.string(),
      summary: z.string(),
    }),
  });

  console.log(result.object);
  console.log();
  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
  console.log('Metadata:', result.providerMetadata);
}

main().catch((error: Error) => {
  console.error(JSON.stringify(error, null, 2));
});
