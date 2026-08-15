import {
  deepSeek,
  type DeepSeekLanguageModelChatOptions,
} from '@ai-sdk/deepseek';
import { streamText } from 'ai';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';

run(async () => {
  const result = streamText({
    model: deepSeek('deepseek-v4-flash'),
    prompt: 'How many "r"s are in the word "strawberry"?',
    providerOptions: {
      deepseek: {
        // the DeepSeek V4 models think by default:
        thinking: { type: 'disabled' },
      } satisfies DeepSeekLanguageModelChatOptions,
    },
  });

  printFullStream({ result });
});
