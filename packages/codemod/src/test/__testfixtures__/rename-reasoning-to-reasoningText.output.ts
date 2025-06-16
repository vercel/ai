// @ts-nocheck

import { bedrock } from '@ai-sdk/amazon-bedrock';
import { generateText } from 'ai';

const { steps } = await generateText({
  model: bedrock('us.anthropic.claude-3-7-sonnet-20250219-v1:0'),
  system: `You are a helpful, respectful and honest assistant.`,
  messages,
  maxSteps: 5,
  providerOptions: {
    bedrock: {
      reasoningConfig: { type: 'enabled', budgetTokens: 2048 },
    },
  },
});

const test = {
  reasoning: 'should not be renamed',
};
for (const step of steps) {
  console.log(step.reasoningText);
}
steps.forEach(step => {
  console.log(step.reasoningText);
});
console.log(test.reasoning);
