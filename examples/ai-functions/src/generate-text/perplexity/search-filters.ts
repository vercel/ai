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
      'Summarize recent United States federal AI policy updates from official sources.',
    providerOptions: {
      perplexity: {
        tools: [
          {
            type: 'web_search',
            filters: {
              search_domain_filter: [
                'whitehouse.gov',
                'congress.gov',
                'federalregister.gov',
              ],
              search_after_date_filter: '1/1/2026',
            },
            max_results: 10,
          },
        ],
      } satisfies PerplexityLanguageModelOptions,
    },
  });

  console.log(result.text);
  console.log();
  console.log('Sources:', result.sources);
  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
  console.log('Metadata:', result.finalStep.providerMetadata);
});
