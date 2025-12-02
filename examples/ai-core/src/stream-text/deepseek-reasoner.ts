import { deepseek, DeepSeekChatOptions } from '@ai-sdk/deepseek';
import { streamText } from 'ai';
import { printFullStream } from '../lib/print-full-stream';
import { run } from '../lib/run';

run(async () => {
  const result = streamText({
    model: deepseek('deepseek-reasoner'),
    prompt: 'How many "r"s are in the word "strawberry"?',
    providerOptions: {
      deepseek: {
        thinking: { type: 'enabled' },
      } satisfies DeepSeekChatOptions,
    },
  });

  printFullStream({ result });
});
