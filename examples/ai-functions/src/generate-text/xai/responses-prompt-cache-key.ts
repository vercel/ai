import { xai, type XaiLanguageModelResponsesOptions } from '@ai-sdk/xai';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: xai.responses('grok-4-fast-non-reasoning'),
    providerOptions: {
      xai: {
        promptCacheKey: 'my-conversation-123',
      } satisfies XaiLanguageModelResponsesOptions,
    },
    prompt: 'What is the capital of France?',
  });

  console.log(result.text);
  console.log('Usage:', result.usage);
});
