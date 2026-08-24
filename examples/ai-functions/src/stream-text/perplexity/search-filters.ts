import {
  perplexity,
  type PerplexityLanguageModelOptions,
} from '@ai-sdk/perplexity';
import { streamText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = streamText({
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

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  console.log();
  console.log('Sources:', await result.sources);
  console.log('Finish reason:', await result.finishReason);
  console.log('Usage:', await result.usage);
  console.log(
    'Metadata:',
    JSON.stringify((await result.finalStep).providerMetadata, null, 2),
  );
});
