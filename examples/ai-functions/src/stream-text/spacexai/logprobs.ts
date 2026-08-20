import {
  spacexai,
  type SpaceXAILanguageModelChatOptions,
} from '@ai-sdk/spacexai';
import { streamText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = streamText({
    model: spacexai('grok-4.5'),
    prompt: 'write one short sentence about san francisco',
    include: {
      rawChunks: true,
    },
    providerOptions: {
      spacexai: {
        logprobs: true,
        topLogprobs: 3,
      } satisfies SpaceXAILanguageModelChatOptions,
    },
  });

  for await (const part of result.stream) {
    if (part.type === 'raw') {
      console.log('raw:', JSON.stringify(part.rawValue));
      continue;
    }

    if (part.type === 'text-delta') {
      console.log('text:', part.text);
      continue;
    }

    if (part.type === 'finish') {
      console.log('finish:', part.finishReason);
    }
  }

  console.log();
  console.log('warnings:', await result.warnings);
  console.log('usage:', await result.usage);
});
