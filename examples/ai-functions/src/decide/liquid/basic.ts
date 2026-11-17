import { liquid } from '@ai-sdk/liquid';
import { experimental_decide } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await experimental_decide({
    model: liquid.decisionModel('d1.2'),
    state:
      'Our production API is returning 500 errors on every request. All customers are affected and we are losing revenue.',
    questions: {
      team: {
        type: 'choice',
        instructions: 'Which team should handle this ticket?',
        criteria: {
          billing: 'Charges, invoices, refunds, or payment methods',
          engineering: 'Bugs, outages, and technical malfunctions',
          account: 'Sign-in, permissions, or plan changes',
        },
      },
      outage: {
        type: 'boolean',
        instructions: 'Is the customer reporting a service outage?',
      },
      urgency: {
        type: 'score',
        instructions: 'How urgent is this ticket?',
        criteria: [
          'Can wait: no immediate business impact',
          'Should handle today: minor or non-blocking issue',
          'Time-sensitive: noticeable customer impact',
          'Blocking revenue: critical failure affecting customers',
        ],
      },
    },
  });

  console.log('Answers:', result.answers);
  console.log('Usage:', result.usage);
  console.log('Model:', result.response.modelId);
  console.log('Provider metadata:', result.providerMetadata);
});
