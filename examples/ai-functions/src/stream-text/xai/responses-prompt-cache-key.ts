import { xai, type XaiLanguageModelResponsesOptions } from '@ai-sdk/xai';
import { streamText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const cacheKey = `demo-${Date.now()}`;

  console.log('Request 1 (cold cache):');
  const result1 = streamText({
    model: xai.responses('grok-4-fast-non-reasoning'),
    providerOptions: {
      xai: {
        promptCacheKey: cacheKey,
      } satisfies XaiLanguageModelResponsesOptions,
    },
    prompt: 'What is the capital of France?',
  });

  for await (const textPart of result1.textStream) {
    process.stdout.write(textPart);
  }
  const usage1 = await result1.usage;
  console.log('\nCached tokens:', usage1.inputTokenDetails?.cacheReadTokens);

  console.log('\nRequest 2 (warm cache, same key):');
  const result2 = streamText({
    model: xai.responses('grok-4-fast-non-reasoning'),
    providerOptions: {
      xai: {
        promptCacheKey: cacheKey,
      } satisfies XaiLanguageModelResponsesOptions,
    },
    prompt: 'What is the capital of France?',
  });

  for await (const textPart of result2.textStream) {
    process.stdout.write(textPart);
  }
  const usage2 = await result2.usage;
  console.log('\nCached tokens:', usage2.inputTokenDetails?.cacheReadTokens);
});
