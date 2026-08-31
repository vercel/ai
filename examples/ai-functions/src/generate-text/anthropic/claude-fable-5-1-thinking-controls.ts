import {
  anthropic,
  type AnthropicLanguageModelOptions,
} from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
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

  console.log('Reasoning:', result.reasoning);
  console.log('Text:', result.text);
});
