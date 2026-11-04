import { baseten } from '@ai-sdk/baseten';
import { experimental_decide } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await experimental_decide({
    model: baseten.decisionModel('decision-models/baseten-mammoth-27b-latest'),
    state: 'I was charged twice. Please refund the duplicate charge.',
    questions: {
      route: {
        type: 'choice',
        instructions: 'Which team should handle this request?',
        criteria: {
          billing: 'Payments, charges, and refunds',
          support: 'Technical troubleshooting',
        },
      },
      refund: {
        type: 'boolean',
        instructions: 'Is the customer asking for a refund?',
      },
      urgency: {
        type: 'score',
        instructions: 'How urgent is the request?',
        criteria: [
          'Routine request',
          'Needs attention today',
          'Immediate emergency',
        ],
      },
    },
  });

  console.log('Answers:', result.answers);
  console.log('Usage:', result.usage);
  console.log('Model:', result.response.modelId);
  console.log('Provider metadata:', result.providerMetadata);
  console.log('Response body:', JSON.stringify(result.response.body, null, 2));
});
