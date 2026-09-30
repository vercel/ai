import { openai, type OpenAIResponsesProviderOptions } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { performance } from 'node:perf_hooks';
import { run } from '../lib/run';

run(async () => {
  const start = performance.now();
  const result = streamText({
    model: openai.responses('gpt-5.6'),
    prompt:
      'Review this deployment order for failure modes: migrate the database, deploy the application, then take a backup. Return the three most important risks and a corrected order.',
    providerOptions: {
      openai: {
        reasoningEffort: 'medium',
        reasoningMode: 'pro',
      } satisfies OpenAIResponsesProviderOptions,
    },
  });

  for await (const textDelta of result.textStream) {
    process.stdout.write(textDelta);
  }

  console.log();
  console.log('Duration:', Math.round(performance.now() - start), 'ms');
  console.log('Usage:', await result.usage);
});
