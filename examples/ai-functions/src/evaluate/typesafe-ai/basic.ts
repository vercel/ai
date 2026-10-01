import { typeSafeAi } from '@ai-sdk/typesafe-ai';
import { experimental_evaluate } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await experimental_evaluate({
    model: typeSafeAi.evaluationModel('jev-latest'),
    state: 'I was charged twice. Please refund the duplicate.',
    questions: {
      department: {
        type: 'choice',
        instructions: 'Which team should handle this?',
        criteria: {
          billing: 'Charges and refunds',
          technical: 'Bugs and outages',
          other: null,
        },
      },
      severity: {
        type: 'score',
        instructions: 'How severe is the issue?',
        criteria: ['Cosmetic', 'Workaround exists', 'Blocking; no workaround'],
      },
      requestsRefund: {
        type: 'boolean',
        instructions: 'Is the customer requesting money back?',
      },
    },
  });

  console.log('Answers:', result.answers);
  console.log('Usage:', result.usage);
  console.log('Model:', result.response.modelId);
  console.log('Provider metadata:', result.providerMetadata);
});
