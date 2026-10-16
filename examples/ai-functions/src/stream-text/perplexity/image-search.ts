import {
  perplexity,
  type PerplexityLanguageModelOptions,
} from '@ai-sdk/perplexity';
import { streamText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = streamText({
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

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  console.log();
  console.log(
    'Images:',
    JSON.stringify(
      (await result.finalStep).providerMetadata?.perplexity?.images,
      null,
      2,
    ),
  );
  console.log('Finish reason:', await result.finishReason);
});
