import { inception } from '@ai-sdk/inception';
import { experimental_decide as decide } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await decide({
    model: inception.decisionModel('mercury-decide'),
    state: { message: 'Please refund the duplicate charge on my account.' },
    questions: {
      billing: {
        type: 'boolean',
        instructions: 'Is this request about billing?',
      },
      team: {
        type: 'choice',
        criteria: {
          billing: 'Payments, charges, and refunds',
          support: 'Technical support and other requests',
        },
      },
      urgency: {
        type: 'score',
        instructions: 'How urgent is this request?',
        criteria: [
          'Can wait',
          'Needs attention soon',
          'Needs immediate attention',
        ],
      },
    },
  });

  console.log('Answers:', result.answers);
  console.log('Usage:', result.usage);
  console.log('Provider metadata:', result.providerMetadata);
});
