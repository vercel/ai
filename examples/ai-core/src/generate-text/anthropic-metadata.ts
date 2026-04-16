import { anthropic, type AnthropicProviderOptions } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import { run } from '../lib/run';
import { print } from '../lib/print';

run(async () => {
  const result = await generateText({
    model: anthropic('claude-sonnet-4-5'),
    prompt: 'Invent a new holiday and describe its traditions.',
    providerOptions: {
      anthropic: {
        metadata: { userId: 'user-123' },
      } satisfies AnthropicProviderOptions,
    },
  });

  print('Content:', result.text);
});
