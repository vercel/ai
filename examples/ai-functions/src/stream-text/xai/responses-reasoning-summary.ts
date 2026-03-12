import { xai, type XaiLanguageModelResponsesOptions } from '@ai-sdk/xai';
import { streamText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = streamText({
    model: xai.responses('grok-3-mini-latest'),
    providerOptions: {
      xai: {
        reasoningEffort: 'low',
        reasoningSummary: 'detailed',
      } satisfies XaiLanguageModelResponsesOptions,
    },
    prompt: 'Explain quantum entanglement briefly.',
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  console.log();
  console.log('Usage:', await result.usage);
});
