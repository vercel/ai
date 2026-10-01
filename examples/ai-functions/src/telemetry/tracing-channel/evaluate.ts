import { typeSafeAi } from '@ai-sdk/typesafe-ai';
import { tracingChannel } from 'node:diagnostics_channel';
import {
  AI_SDK_TELEMETRY_TRACING_CHANNEL,
  experimental_evaluate,
  type TelemetryTracingChannelMessage,
} from 'ai';
import { run } from '../../lib/run';

tracingChannel(AI_SDK_TELEMETRY_TRACING_CHANNEL).subscribe({
  start(message) {
    const telemetry = message as TelemetryTracingChannelMessage;

    console.log(
      `[tracing-channel] ${telemetry.type}`,
      JSON.stringify(telemetry.event, null, 2),
    );
  },
  end() {},
  asyncStart() {},
  asyncEnd() {},
  error() {},
});

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
      functionId: 'evaluate-tracing-channel-example',
    },
  });

  console.log('Answers:', result.answers);
});
