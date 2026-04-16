import { anthropic, type AnthropicProviderOptions } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import { run } from '../lib/run';
import { print } from '../lib/print';

run(async () => {
  const result = await generateText({
    model: anthropic('claude-opus-4-7'),
    prompt: 'Calculate how many days are in three weeks.',
    providerOptions: {
      anthropic: {
        thinking: { type: 'adaptive', display: 'summarized' },
        effort: 'xhigh',
      } satisfies AnthropicProviderOptions,
    },
  });

  print('Reasoning:', result.reasoningText);
  print('Content:', result.text);
  print('Usage:', result.usage);
});
