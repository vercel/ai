import { openai } from '@ai-sdk/openai';
import { OpenTelemetry } from '@ai-sdk/otel';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-node';
import { experimental_extract, registerTelemetry } from 'ai';
import { run } from '../../lib/run';

const sdk = new NodeSDK({ traceExporter: new ConsoleSpanExporter() });
sdk.start();

registerTelemetry(
  new OpenTelemetry({
    experimental_extraction: true,
  }),
);

run(async () => {
  try {
    const result = await experimental_extract({
      model: openai.extractionModel('gpt-6.2-sol'),
      state:
        'Invoice INV-2041 from Acme Corp, total due $1,250.00 by March 3. Contacts: Ana, Bo.',
      fields: {
        invoiceNumber: { type: 'text', instructions: 'The invoice number' },
        total: { type: 'number', instructions: 'Total due', unit: 'USD' },
        dueDate: { type: 'date', instructions: 'Due date' },
        contacts: {
          type: 'list',
          items: 'text',
          instructions: 'Contact names',
        },
      },
      referenceDate: '2026-11-18',
      telemetry: {
        functionId: 'extract-otel-example',
      },
    });

    console.log('Answers:', result.answers);
  } finally {
    await sdk.shutdown();
  }
});
