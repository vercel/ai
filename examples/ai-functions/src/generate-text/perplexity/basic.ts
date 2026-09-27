import { perplexity } from '@ai-sdk/perplexity';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: perplexity('low'),
    prompt: 'What has happened in San Francisco recently?',
    providerOptions: {
      perplexity: {
<<<<<<< HEAD
        search_recency_filter: 'week',
      },
=======
        tools: [
          {
            type: 'web_search',
            filters: { search_recency_filter: 'week' },
          },
        ],
      } satisfies PerplexityLanguageModelOptions,
>>>>>>> 38fe0e5997 (feat(provider/perplexity)!: migrate to Agent API (#18991))
    },
  });

  console.log(result.text);
  console.log();
  console.log('Sources:', result.sources);
  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
  console.log('Metadata:', result.providerMetadata);

  for (const source of result.sources) {
    if (source.sourceType === 'url') {
      console.log('ID:', source.id);
      console.log('Title:', source.title);
      console.log('URL:', source.url);
      console.log('Provider metadata:', source.providerMetadata);
      console.log();
    }
  }
});
