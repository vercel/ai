import 'dotenv/config';
import { perplexity } from '@ai-sdk/perplexity';
import { generateObject, generateText } from 'ai';
import { z } from 'zod/v4';

async function main() {
  const result = await generateObject({
    model: perplexity('sonar-pro'),
    prompt: 'What has happened in San Francisco recently?',
    providerOptions: {
      perplexity: {
        search_recency_filter: 'week',
      },
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
