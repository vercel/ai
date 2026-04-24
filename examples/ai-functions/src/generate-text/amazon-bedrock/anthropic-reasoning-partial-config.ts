import {
  bedrock,
  type AmazonBedrockLanguageModelOptions,
} from '@ai-sdk/amazon-bedrock';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
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

  console.log('Reasoning:');
  console.log(result.reasoning);
  console.log();

  console.log('Text:');
  console.log(result.text);
});
