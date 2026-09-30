import { openai, type OpenAIResponsesProviderOptions } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { run } from '../lib/run';

run(async () => {
  const firstResult = await generateText({
    model: openai.responses('gpt-6-astra'),
    prompt: 'Draft a concise database migration plan.',
    providerOptions: {
      openai: {
        reasoningEffort: 'low',
        promptCacheOptions: { ttl: '30m' },
      } satisfies OpenAIResponsesProviderOptions,
    },
  });

  const previousResponseId = firstResult.providerMetadata?.openai.responseId as
    | string
    | undefined;

  if (!previousResponseId) {
    throw new Error('OpenAI did not return a response ID.');
  }

  console.log('Low-effort response:');
  console.log(firstResult.text);
  console.log();

  const secondResult = await generateText({
    model: openai.responses('gpt-6-astra'),
    // Keep the request-level effort unchanged to preserve the cached prefix.
    prompt: 'Analyze its failure modes and add detailed rollback steps.',
    providerOptions: {
      openai: {
        previousResponseId,
        reasoningEffort: 'low',
        reasoningEffortUpdate: 'high',
        promptCacheOptions: { ttl: '30m' },
      } satisfies OpenAIResponsesProviderOptions,
    },
  });

  console.log('High-effort continuation:');
  console.log(secondResult.text);
});
