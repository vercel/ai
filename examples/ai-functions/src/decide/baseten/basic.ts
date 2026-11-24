import { baseten } from '@ai-sdk/baseten';
import { experimental_decide } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await experimental_decide({
    model: baseten.decisionModel('decision-models/baseten-bison-latest'),
    state:
      'I was charged twice for my subscription. Please refund the duplicate charge today.',
    questions: {
      team: {
        type: 'choice',
        instructions: 'Which team should handle this ticket?',
        criteria: {
          billing: 'Charges, refunds, and payment methods',
          engineering: 'Bugs and outages',
          account: 'Sign-in, permissions, or plan changes',
        },
      },
      refund: {
        type: 'boolean',
        instructions: 'Is the customer asking for a refund?',
      },
      urgency: {
        type: 'score',
        instructions: 'How urgent is this ticket?',
        criteria: ['Can wait', 'Handle today', 'Blocking revenue'],
      },
    },
  });

  console.log('Answers:', result.answers);
  console.log('Usage:', result.usage);
  console.log('Provider metadata:', result.providerMetadata);
});
