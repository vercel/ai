import { xai, type XaiLanguageModelResponsesOptions } from '@ai-sdk/xai';
import { streamText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = streamText({
    model: xai.responses('grok-4-fast-non-reasoning'),
    providerOptions: {
      xai: {
        promptCacheKey: 'my-conversation-123',
      } satisfies XaiLanguageModelResponsesOptions,
    },
    prompt: 'What is the capital of France?',
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  console.log();
  console.log('Usage:', await result.usage);
});
