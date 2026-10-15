import {
  perplexity,
  type PerplexityLanguageModelOptions,
} from '@ai-sdk/perplexity';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: perplexity('openai/gpt-6-luna'),
    prompt:
      'Find two photos of the Golden Gate Bridge and say in one sentence what each shows.',
    providerOptions: {
      perplexity: {
        tools: [
          {
            type: 'image_search',
            max_results: 3,
            filters: { format_filter: ['jpeg', 'png'] },
          },
        ],
      } satisfies PerplexityLanguageModelOptions,
    },
  });

  console.log(result.text);
  console.log();
  console.log('Images:', result.finalStep.providerMetadata?.perplexity?.images);
  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
});
