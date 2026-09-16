import { anthropic } from '@ai-sdk/anthropic';
import { experimental_evaluate } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await experimental_evaluate({
    model: anthropic.evaluationModel('claude-haiku-4-5-20251001'),
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
      requestsRefund: {
        type: 'boolean',
        instructions: 'Is the customer requesting money back?',
      },
      severity: {
        type: 'score',
        instructions: 'How severe is the issue?',
        criteria: ['Cosmetic', 'Workaround exists', 'Blocking; no workaround'],
      },
    },
  });

  console.log('Answers:', result.answers);
  // Boolean probabilities are prompted estimates; choose a threshold for your task.
  console.log(
    'Requests refund:',
    result.answers.requestsRefund.probability >= 0.5,
  );
  console.log('Usage:', result.usage);
  console.log('Model:', result.response.modelId);
});
