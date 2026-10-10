import {
  perplexity,
  type PerplexityLanguageModelOptions,
} from '@ai-sdk/perplexity';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: perplexity('low'),
    prompt:
      'What recent peer-reviewed research explains the relationship between sleep and memory consolidation?',
    providerOptions: {
      perplexity: {
        searchMode: 'academic',
        webSearchOptions: {
          searchContextSize: 'low',
          userLocation: { country: 'US' },
        },
        searchDomainFilter: [
          'arxiv.org',
          'nature.com',
          'pubmed.ncbi.nlm.nih.gov',
        ],
        searchRecencyFilter: 'year',
      } satisfies PerplexityLanguageModelOptions,
    },
  });

  console.log(result.text);
  console.log();
  console.log('Sources:', result.sources);
  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
});
