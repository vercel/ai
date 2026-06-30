import {
  anthropic,
  type AnthropicLanguageModelOptions,
} from '@ai-sdk/anthropic';
import { streamText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = streamText({
    model: anthropic('claude-sonnet-5'),
    prompt: 'How many "r"s are in the word "strawberry"?',
    onError: error => {
      console.error(error);
    },
    providerOptions: {
      anthropic: {
        // Claude Sonnet 5 uses adaptive thinking. `display: 'summarized'` is
        // required to receive reasoning output in the stream.
        thinking: { type: 'adaptive', display: 'summarized' },
        effort: 'medium',
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
