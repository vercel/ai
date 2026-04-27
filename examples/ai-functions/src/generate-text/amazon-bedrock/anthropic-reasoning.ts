import {
  bedrock,
  type AmazonBedrockLanguageModelOptions,
} from '@ai-sdk/amazon-bedrock';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: bedrock('us.anthropic.claude-opus-4-7'),
    prompt: 'How many "r"s are in the word "strawberry"?',
    reasoning: 'high',
    providerOptions: {
      bedrock: {
        reasoningConfig: { type: 'adaptive', display: 'summarized' },
      } satisfies AmazonBedrockLanguageModelOptions,
    },
  });

  console.log('Reasoning:');
  console.log(result.reasoning);
  console.log();

  console.log('Text:');
  console.log(result.text);
});
