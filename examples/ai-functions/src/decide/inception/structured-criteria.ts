import { inception } from '@ai-sdk/inception';
import { experimental_decide as decide } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await decide({
    model: inception.decisionModel('mercury-decide'),
    state: {
      ticket: {
        message: 'The latest update broke sign-in for our whole team.',
      },
      account: { plan: 'enterprise', affectedUsers: 50 },
    },
    questions: {
      escalate: {
        type: 'boolean',
        criteria: {
          true: { impact: 'Multiple users blocked', account: 'Enterprise' },
          false: { impact: 'Minor inconvenience with a workaround' },
        },
      },
      severity: {
        type: 'score',
        instructions: { task: 'Assess the customer impact of this ticket.' },
        criteria: [
          { impact: 'Minor', examples: ['Visual glitch'] },
          { impact: 'Moderate', examples: ['Feature degraded'] },
          { impact: 'Critical', examples: ['Team cannot sign in'] },
        ],
      },
    },
  });

  console.log('Answers:', result.answers);
  console.log('Provider metadata:', result.providerMetadata);
});
