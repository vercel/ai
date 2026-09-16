import { typesafe } from '@ai-sdk/typesafe-ai';
import { experimental_evaluate } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await experimental_evaluate({
    model: typesafe.evaluationModel('jev-latest'),
    state: {
      message: 'I was charged twice. Please refund the duplicate.',
      order: { amount: 49 },
    },
    questions: {
      department: {
        type: 'choice',
        instructions: { question: 'Which team should handle this?' },
        criteria: {
          billing: { includes: ['Charges', 'Invoices', 'Refunds'] },
          technical: ['Bugs', 'Outages'],
          other: null,
        },
      },
      severity: {
        type: 'score',
        instructions: ['How severe is the issue?'],
        criteria: [
          { meaning: 'Cosmetic; functionality works' },
          'Functionality impaired; workaround exists',
          'Blocking; no workaround',
        ],
      },
      requestsRefund: {
        type: 'boolean',
        instructions: 'Is the customer requesting a refund?',
        criteria: {
          true: { meaning: 'Explicit request for money back' },
          false: null,
        },
      },
    },
  });

  console.log('Answers:', result.answers);
  console.log('Rounding:', result.rounding);
  console.log('Raw response:', result.response.body);
  console.log(
    'Route to refund review:',
    result.answers.requestsRefund.probability >= 0.8,
  );
});
