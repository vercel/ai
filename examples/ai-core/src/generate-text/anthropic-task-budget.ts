import { anthropic, type AnthropicProviderOptions } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import { run } from '../lib/run';
import { print } from '../lib/print';

run(async () => {
  const result = await generateText({
    model: anthropic('claude-opus-4-7'),
    prompt: 'Research the pros and cons of Rust vs Go for building CLI tools.',
    maxRetries: 0,
    providerOptions: {
      anthropic: {
        taskBudget: {
          type: 'tokens',
          total: 400000,
        },
      } satisfies AnthropicProviderOptions,
    },
  });

  print('Text:', result.text);
  print('Usage:', result.usage);
});
