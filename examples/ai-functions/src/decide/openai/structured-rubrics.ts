import { openai } from '@ai-sdk/openai';
import { experimental_decide } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await experimental_decide({
    model: openai.decisionModel('gpt-6-luna'),
    maxRetries: 0,
    state:
      'I was charged twice. Please refund the duplicate charge. I can still use the product.',
    questions: {
      department: {
        type: 'choice',
        instructions: { question: 'Which team should handle this?' },
        criteria: {
          billing: { includes: ['Charges', 'Invoices', 'Refunds'] },
          technical: ['Bugs', 'Outages'],
          other: null,
        },
      },
      severity: {
        type: 'score',
        instructions: ['How severe is the issue?'],
        criteria: [
          { meaning: 'Cosmetic; functionality works' },
          ['Functionality impaired', 'Workaround exists'],
          'Blocking; no workaround',
        ],
      },
      requestsRefund: {
        type: 'boolean',
        instructions: 'Is the customer requesting a refund?',
        criteria: {
          true: ['Explicit request for money back'],
          false: { meaning: 'Only asks about status' },
        },
      },
    },
    telemetry: {
      integrations: {
        experimental_onDecisionModelCallStart: ({ state, questions }) => {
          console.log('Normalized state:', state);
          console.log('Normalized questions:', questions);
        },
      },
    },
  });

  console.log('Answers:', result.answers);
  console.log('Usage:', result.usage);
});
