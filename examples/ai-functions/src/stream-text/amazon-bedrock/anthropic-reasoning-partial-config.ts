import {
  bedrock,
  type AmazonBedrockLanguageModelOptions,
} from '@ai-sdk/amazon-bedrock';
import { streamText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = streamText({
    model: bedrock('us.anthropic.claude-opus-4-7'),
    prompt:
      'Solve this step by step: if f(x) = x^3 - 6x^2 + 11x - 6, find all roots and prove they are correct.',
    reasoning: 'high',
    providerOptions: {
      bedrock: {
        /*
         * Partial reasoningConfig: `type` and `maxReasoningEffort` are derived
         * from the top-level `reasoning` parameter. Only `display` is provided
         * here and merged on top of the derived fields.
         */
        reasoningConfig: { display: 'summarized' },
      } satisfies AmazonBedrockLanguageModelOptions,
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
});
