import { perplexity } from '@ai-sdk/perplexity';
import { generateText, Output } from 'ai';
import { z } from 'zod';
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
    output: Output.array({
      element: z.object({
        title: z.string(),
        summary: z.string(),
      }),
    }),
  });

  console.log(result.output);
  console.log();
  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
  console.log('Metadata:', result.providerMetadata);
});
