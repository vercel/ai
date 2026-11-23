import { scaledown } from '@ai-sdk/scaledown';
import { experimental_decide } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await experimental_decide({
    model: scaledown.decisionModel('classify-1'),
    state:
      'I was charged twice for my subscription. Please refund the duplicate.',
    questions: {
      category: {
        type: 'choice',
        instructions: 'Which team should handle this request?',
        criteria: {
          billing: 'Charges, invoices, and refunds',
          technical: 'Bugs and outages',
          account: 'Login and account settings',
        },
      },
    },
  });

  console.log('Answers:', result.answers);
  console.log('Usage:', result.usage);
});
