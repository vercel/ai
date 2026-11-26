import { heygen } from '@ai-sdk/heygen';
import { experimental_decide } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await experimental_decide({
    model: heygen.decisionModel('heygen-decision-1'),
    state:
      'Video export fails for everyone on our team after today’s update. We have no workaround and cannot deliver our project.',
    questions: {
      team: {
        type: 'choice',
        instructions: 'Which support team should handle this request?',
        criteria: {
          video: 'Video creation, rendering, or export problems',
          account: 'Sign-in, access, or workspace administration',
          billing: 'Payments, invoices, or subscription charges',
        },
      },
      blocked: {
        type: 'boolean',
        instructions:
          'Is the customer unable to complete their work without a workaround?',
      },
      impact: {
        type: 'score',
        instructions: 'How much does this issue affect the customer’s work?',
        criteria: [
          'Cosmetic issue; work can continue normally',
          'Work is slower, but a usable workaround exists',
          'Work cannot continue and no workaround is available',
        ],
      },
    },
  });

  console.log('Answers:', result.answers);
  console.log('Usage:', result.usage);
  console.log('Model:', result.response.modelId);
  console.log('Provider metadata:', result.providerMetadata);
});
