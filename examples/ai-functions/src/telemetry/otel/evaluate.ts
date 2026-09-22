import { openai } from '@ai-sdk/openai';
import { OpenTelemetry } from '@ai-sdk/otel';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-node';
import { experimental_evaluate, registerTelemetry } from 'ai';
import { run } from '../../lib/run';

const sdk = new NodeSDK({ traceExporter: new ConsoleSpanExporter() });
sdk.start();

registerTelemetry(
  new OpenTelemetry({
    experimental_evaluation: true,
    usage: true,
  }),
);

run(async () => {
  try {
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
        requestsRefund: {
          type: 'boolean',
          instructions: 'Is the customer requesting money back?',
        },
        severity: {
          type: 'score',
          instructions: 'How severe is the issue?',
          criteria: [
            'Cosmetic',
            'Workaround exists',
            'Blocking; no workaround',
          ],
        },
      },
      telemetry: {
        functionId: 'evaluate-otel-example',
      },
    });

    console.log('Answers:', result.answers);
  } finally {
    await sdk.shutdown();
  }
});
