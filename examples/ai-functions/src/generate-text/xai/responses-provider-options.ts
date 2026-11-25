import { xai, type XaiLanguageModelResponsesOptions } from '@ai-sdk/xai';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: xai.responses('grok-4.7'),
    topK: 40,
    providerOptions: {
      xai: {
        minP: 0.1,
        parallelToolCalls: false,
        promptCacheKey: 'ai-functions-xai-provider-options',
        safetyIdentifier: 'ai-functions-example-user',
        serviceTier: 'priority',
        user: 'ai-functions-example-user',
      } satisfies XaiLanguageModelResponsesOptions,
    },
    prompt: 'Reply with exactly: xAI provider options work',
  });

  console.log('Text:', result.text);
  console.log(
    'Applied service tier:',
    result.providerMetadata?.xai?.serviceTier,
  );
  console.log('Usage:', result.usage);
});
