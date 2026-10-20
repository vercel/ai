import { perplexity } from '@ai-sdk/perplexity';
import { experimental_decide } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await experimental_decide({
    model: perplexity.decisionModel('pplx-decider-latest'),
    state: { ticket: 'I was charged twice. Please refund the extra payment.' },
    questions: {
      team: {
        type: 'choice',
        // Instructions are omitted; criteria describe the decision.
        criteria: {
          billing: { includes: ['Charges', 'Refunds'] },
          support: ['Technical problems'],
          other: null,
        },
      },
      refund: {
        type: 'boolean',
        instructions: null,
        // Without instructions, at least one Boolean criterion must be non-null.
        criteria: {
          true: 'The customer asks for money back',
          false: 'The customer only asks for information',
        },
      },
    },
  });

  console.log('Team:', result.answers.team.choice);
  console.log('Team probabilities:', result.answers.team.probabilities);
  console.log('Refund probability:', result.answers.refund.probability);
  console.log('Usage:', result.usage);
});
