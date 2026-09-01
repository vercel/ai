import {
  anthropic,
  type AnthropicLanguageModelOptions,
} from '@ai-sdk/anthropic';
import { streamText } from 'ai';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';

run(async () => {
  const result = streamText({
    model: anthropic('claude-fable-5-1'),
    prompt: 'Compare two approaches to implementing an LRU cache.',
    providerOptions: {
      anthropic: {
        thinking: {
          type: 'adaptive',
          display: 'updates',
          blockBinding: {
            prefixMismatchBehavior: 'drop_block',
          },
        },
      } satisfies AnthropicLanguageModelOptions,
    },
  });

  await printFullStream({ result });
});
