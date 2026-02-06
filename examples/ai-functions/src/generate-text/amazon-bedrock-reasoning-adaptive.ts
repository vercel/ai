import { bedrock } from '@ai-sdk/amazon-bedrock';
import { generateText, stepCountIs } from 'ai';
import { run } from '../lib/run';

run(async () => {
  const result = await generateText({
    model: bedrock('us.anthropic.claude-opus-4-6-v1'),
    prompt: 'How many "r"s are in the word "strawberry"?',
    providerOptions: {
      bedrock: {
        reasoningConfig: { type: 'adaptive', maxReasoningEffort: 'max' },
      },
    },
    maxRetries: 0,
    stopWhen: stepCountIs(5),
  });

  console.log('Reasoning:');
  console.log(result.reasoning);
  console.log();

  console.log('Text:');
  console.log(result.text);
  console.log();

  console.log('Warnings:', result.warnings);
});
