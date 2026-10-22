import { perplexity } from '@ai-sdk/perplexity';
import { experimental_decide } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await experimental_decide({
    model: perplexity.decisionModel('pplx-decider-latest'),
    state: 'The product stopped working.',
    questions: {
      severity: {
        type: 'score',
        criteria: ['Product unusable'],
      },
    },
  });

  // A single level always has index 0 and probability 1.
  // Use two or more levels to distinguish outcomes.
  console.log('Score:', result.answers.severity.score); // 0
  console.log('Probabilities:', result.answers.severity.probabilities); // { '0': 1 }
  console.log('Legend:', result.providerMetadata?.perplexity?.legend);
  console.log('Usage:', result.usage);
});
