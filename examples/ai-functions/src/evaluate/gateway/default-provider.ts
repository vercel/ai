import { gateway } from '@ai-sdk/gateway';
import { experimental_evaluate } from 'ai';
import { run } from '../../lib/run';

// Evaluation does not fall back to Gateway for bare model id strings the way
// the other model kinds do, so the default provider is set explicitly here.
globalThis.AI_SDK_DEFAULT_PROVIDER = gateway;

run(async () => {
  const result = await experimental_evaluate({
    model: 'typesafe-ai/jev-latest',
    state: 'I was charged twice.',
    questions: {
      department: {
        type: 'choice',
        instructions: 'Which team should handle this?',
        criteria: { billing: 'Charges and refunds', support: 'Other requests' },
      },
    },
  });

  console.log('Department:', result.answers.department.choice);
  console.log('Usage:', result.usage);
});
