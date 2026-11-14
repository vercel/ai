import { scaledown } from '@ai-sdk/scaledown';
import { experimental_decide } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await experimental_decide({
    model: scaledown.decisionModel('classify-1'),
    state: 'The export button crashes in Safari. It works in Chrome.',
    questions: {
      category: {
        type: 'choice',
        criteria: {
          bug: 'Broken functionality',
          feedback: 'Product suggestions',
        },
      },
      hasWorkaround: {
        type: 'boolean',
        instructions: 'Can the user work around this issue?',
      },
      severity: {
        type: 'score',
        instructions: 'How severe is the reported issue?',
        criteria: ['Cosmetic', 'Degraded, with a workaround', 'Blocking'],
      },
    },
  });

  console.log('Answers:', result.answers);
  console.log('Usage:', result.usage);
  console.log('Provider metadata:', result.providerMetadata);
});
