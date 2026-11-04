import { typeSafeAi } from '@ai-sdk/typesafe-ai';
import { experimental_decide, registerTelemetry } from 'ai';
import { run } from '../../lib/run';
import { consoleTelemetry } from './console-telemetry';

registerTelemetry(consoleTelemetry);

run(async () => {
  const result = await experimental_decide({
    model: typeSafeAi.decisionModel('jev-latest'),
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
      functionId: 'decide-console-example',
    },
  });

  console.log('Answers:', result.answers);
});
