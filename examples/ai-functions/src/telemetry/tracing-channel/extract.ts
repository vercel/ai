import { openai } from '@ai-sdk/openai';
import { tracingChannel } from 'node:diagnostics_channel';
import {
  AI_SDK_TELEMETRY_TRACING_CHANNEL,
  experimental_extract,
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
  const result = await experimental_extract({
    model: openai.extractionModel('gpt-6.2-sol'),
    state:
      'Invoice INV-2041 from Acme Corp, total due $1,250.00 by March 3. Contacts: Ana, Bo.',
    fields: {
      invoiceNumber: { type: 'text', instructions: 'The invoice number' },
      total: { type: 'number', instructions: 'Total due', unit: 'USD' },
      dueDate: { type: 'date', instructions: 'Due date' },
      contacts: { type: 'list', items: 'text', instructions: 'Contact names' },
    },
    referenceDate: '2026-11-18',
    telemetry: {
      functionId: 'extract-tracing-channel-example',
    },
  });

  console.log('Answers:', result.answers);
});
