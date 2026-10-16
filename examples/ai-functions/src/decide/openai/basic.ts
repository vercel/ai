import { openai, type OpenAIDecisionModelOptions } from '@ai-sdk/openai';
import { experimental_decide } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await experimental_decide({
    model: openai.decisionModel('gpt-6-luna'),
    providerOptions: {
      openai: {
        safetyIdentifier: 'example-user',
      } satisfies OpenAIDecisionModelOptions,
    },
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
  // Choose a threshold for the native predicate probability for your task.
  console.log(
    'Requests refund:',
    result.answers.requestsRefund.probability >= 0.5,
  );
  console.log('Usage:', result.usage);
  console.log('Native usage:', result.providerMetadata?.openai?.usage);
  console.log('Confidence:', result.providerMetadata?.openai?.confidence);
  console.log('Model:', result.response.modelId);
});
