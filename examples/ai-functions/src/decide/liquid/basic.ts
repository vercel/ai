import { liquid } from '@ai-sdk/liquid';
import { experimental_decide } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await experimental_decide({
    model: liquid.decisionModel('d1'),
    state: {
      message: 'I was charged twice. Please refund the duplicate charge.',
    },
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
      urgency: {
        type: 'score',
        instructions: 'How urgent is this?',
        criteria: ['Low', 'Medium', 'High'],
      },
      requestsRefund: {
        type: 'boolean',
        instructions: 'Is the customer requesting a refund?',
      },
    },
  });

  console.log('Answers:', result.answers);
  console.log('Usage:', result.usage);
  console.log('Provider metadata:', result.providerMetadata);
  return result;
});
