import {
  perplexity,
  type PerplexityLanguageModelOptions,
} from '@ai-sdk/perplexity';
import { streamText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = streamText({
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
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  console.log();
  console.log('Sources:', await result.sources);
  console.log('Finish reason:', await result.finishReason);
  console.log('Usage:', await result.usage);
  console.log(
    'Metadata:',
    JSON.stringify(await result.providerMetadata, null, 2),
  );
}

main().catch(console.error);
