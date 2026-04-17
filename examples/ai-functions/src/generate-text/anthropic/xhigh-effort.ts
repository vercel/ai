import {
  anthropic,
  type AnthropicLanguageModelOptions,
} from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import { run } from '../../lib/run';
import { print } from '../../lib/print';

run(async () => {
  const result = await generateText({
    model: anthropic('claude-opus-4-7'),
<<<<<<< HEAD
    prompt: 'Calculate how many days are in three weeks.',
=======
    prompt:
      'Solve this step by step: if f(x) = x^3 - 6x^2 + 11x - 6, find all roots and prove they are correct.',
    reasoning: 'xhigh',
>>>>>>> ed60b47e6 (fix(provider/amazon-bedrock): fix Anthropic reasoning behavior related to Opus 4.7 (#14582))
    providerOptions: {
      anthropic: {
        thinking: { type: 'adaptive', display: 'summarized' },
        effort: 'xhigh',
      } satisfies AnthropicLanguageModelOptions,
    },
  });

  print('Reasoning:', result.reasoningText);
  print('Content:', result.text);
  print('Usage:', result.usage);
});
