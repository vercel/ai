import {
  anthropic,
  type AnthropicLanguageModelOptions,
} from '@ai-sdk/anthropic';
import { streamText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = streamText({
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

  for await (const part of result.fullStream) {
    if (part.type === 'reasoning-delta') {
      process.stdout.write('\x1b[34m' + part.text + '\x1b[0m');
    } else if (part.type === 'text-delta') {
      process.stdout.write(part.text);
    }
  }

  console.log();
  console.log('Usage:', await result.usage);
});
