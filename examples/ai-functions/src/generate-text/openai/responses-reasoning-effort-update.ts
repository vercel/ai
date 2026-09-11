import {
  openai,
  type OpenAILanguageModelResponsesOptions,
  type OpenaiResponsesProviderMetadata,
} from '@ai-sdk/openai';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const firstResult = await generateText({
    model: openai.responses('gpt-6-astra'),
    reasoning: 'low',
    prompt: 'Draft a concise database migration plan.',
    providerOptions: {
      openai: {
        promptCacheOptions: { ttl: '30m' },
      } satisfies OpenAILanguageModelResponsesOptions,
    },
  });

  const firstMetadata = firstResult.finalStep.providerMetadata as
    | OpenaiResponsesProviderMetadata
    | undefined;
  const previousResponseId = firstMetadata?.openai.responseId;

  if (!previousResponseId) {
    throw new Error('OpenAI did not return a response ID.');
  }

  console.log('Low-effort response:');
  console.log(firstResult.text);
  console.log();

  const secondResult = await generateText({
    model: openai.responses('gpt-6-astra'),
    // Keep the request-level effort unchanged to preserve the cached prefix.
    reasoning: 'low',
    prompt: 'Analyze its failure modes and add detailed rollback steps.',
    providerOptions: {
      openai: {
        previousResponseId,
        reasoningEffortUpdate: 'high',
        promptCacheOptions: { ttl: '30m' },
      } satisfies OpenAILanguageModelResponsesOptions,
    },
  });

  console.log('High-effort continuation:');
  console.log(secondResult.text);
});
