import { perplexity } from '@ai-sdk/perplexity';
import { experimental_decide } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await experimental_decide({
    model: perplexity.decisionModel('pplx-decider-latest'),
    state: { review: 'Great sound, but the battery stopped charging.' },
    questions: {
      defect: {
        type: 'boolean',
        instructions: 'Does the review report a product defect?',
      },
      sentiment: {
        type: 'choice',
        instructions: 'What is the overall sentiment?',
        criteria: {
          positive: 'Mostly satisfied',
          mixed: 'Praise and complaints',
          negative: 'Mostly dissatisfied',
        },
      },
      severity: {
        type: 'score',
        instructions: 'How severe is the problem?',
        criteria: ['Cosmetic', 'Inconvenient', 'Product unusable'],
      },
    },
  });

  console.log('Answers:', result.answers);
  console.log('Usage:', result.usage);
  console.log('Model:', result.response.modelId);
  console.log('Provider metadata:', result.providerMetadata);
});
