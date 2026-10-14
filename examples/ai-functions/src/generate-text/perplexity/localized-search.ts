import {
  perplexity,
  type PerplexityLanguageModelOptions,
} from '@ai-sdk/perplexity';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: perplexity('fast'),
    prompt: 'What are notable public transit updates near me this month?',
    providerOptions: {
      perplexity: {
        tools: [
          {
            type: 'web_search',
            search_context_size: 'medium',
            user_location: {
              country: 'US',
              region: 'California',
              city: 'San Francisco',
              latitude: 37.7749,
              longitude: -122.4194,
            },
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
