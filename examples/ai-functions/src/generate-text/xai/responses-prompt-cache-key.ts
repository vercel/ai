import { xai, type XaiLanguageModelResponsesOptions } from '@ai-sdk/xai';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const cacheKey = `demo-${Date.now()}`;

  console.log('Request 1 (cold cache):');
  const result1 = await generateText({
    model: xai.responses('grok-4-fast-non-reasoning'),
    providerOptions: {
      xai: {
        promptCacheKey: cacheKey,
      } satisfies XaiLanguageModelResponsesOptions,
    },
    prompt: 'What is the capital of France?',
  });

  console.log(result1.text);
  console.log(
    'Cached tokens:',
    result1.usage.inputTokenDetails?.cacheReadTokens,
  );

  console.log('\nRequest 2 (warm cache, same key):');
  const result2 = await generateText({
    model: xai.responses('grok-4-fast-non-reasoning'),
    providerOptions: {
      xai: {
        promptCacheKey: cacheKey,
      } satisfies XaiLanguageModelResponsesOptions,
    },
    prompt: 'What is the capital of France?',
  });

  console.log(result2.text);
  console.log(
    'Cached tokens:',
    result2.usage.inputTokenDetails?.cacheReadTokens,
  );
});
