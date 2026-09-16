import { openai } from '@ai-sdk/openai';
import { experimental_evaluate } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await experimental_evaluate({
    model: openai.evaluationModel('gpt-5.6-luna'),
    state: {
      message:
        'I was charged twice. A refund is pending, so I can keep working.',
    },
    questions: {
      department: {
        type: 'choice',
        instructions: 'Which team should handle this?',
        criteria: {
          billing: 'Charges and refunds',
          technical: 'Bugs and outages',
          other: null,
        },
      },
      severity: {
        type: 'score',
        instructions: 'How severe is the issue?',
        criteria: ['Cosmetic', 'Workaround exists', 'Blocking; no workaround'],
      },
    },
  });

  console.log('Answers:', result.answers);
  console.log('Usage:', result.usage);
  console.log('Model:', result.response.modelId);
});
