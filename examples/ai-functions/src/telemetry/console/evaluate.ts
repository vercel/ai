import { typeSafeAi } from '@ai-sdk/typesafe-ai';
import { experimental_evaluate, registerTelemetry } from 'ai';
import { run } from '../../lib/run';
import { consoleTelemetry } from './console-telemetry';

registerTelemetry(consoleTelemetry);

run(async () => {
  const result = await experimental_evaluate({
    model: typeSafeAi.evaluationModel('jev-latest'),
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
    telemetry: {
      functionId: 'evaluate-console-example',
    },
  });

  console.log('Answers:', result.answers);
});
