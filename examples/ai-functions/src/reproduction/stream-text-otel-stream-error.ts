import { OpenTelemetry } from '@ai-sdk/otel';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
  type SpanProcessor,
} from '@opentelemetry/sdk-trace-node';
import { streamText } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';

const expectedSpanNames = [
  'invoke_agent mock-model-id',
  'step 1',
  'chat mock-model-id',
];

async function main() {
  const startedSpanNames: string[] = [];
  const endedSpanNames: string[] = [];
  let providerStreamErrored = false;
  const exporter = new InMemorySpanExporter();
  const trackingProcessor = {
    onStart(span) {
      startedSpanNames.push(span.name);
    },
    onEnd(span) {
      endedSpanNames.push(span.name);
    },
    async forceFlush() {},
    async shutdown() {},
  } satisfies SpanProcessor;
  const tracerProvider = new BasicTracerProvider({
    spanProcessors: [trackingProcessor, new SimpleSpanProcessor(exporter)],
  });
  const integration = new OpenTelemetry({
    tracer: tracerProvider.getTracer('issue-20586-reproduction'),
  });

  let pullCalls = 0;
  const result = streamText({
    model: new MockLanguageModelV4({
      doStream: async () => ({
        stream: new ReadableStream({
          pull(controller) {
            switch (pullCalls++) {
              case 0:
                controller.enqueue({
                  type: 'stream-start',
                  warnings: [],
                });
                break;
              case 1:
                controller.enqueue({
                  type: 'text-start',
                  id: '1',
                });
                break;
              case 2:
                controller.enqueue({
                  type: 'text-delta',
                  id: '1',
                  delta: 'Hello',
                });
                break;
              case 3:
                providerStreamErrored = true;
                controller.error(new Error('socket closed'));
                break;
            }
          },
        }),
      }),
    }),
    prompt: 'test-input',
    telemetry: {
      integrations: integration,
    },
  });

  await result.consumeStream();
  await tracerProvider.forceFlush();

  const exportedSpans = exporter.getFinishedSpans();
  const exportedSpanNames = exportedSpans.map(span => span.name);
  const missingStartedSpans = expectedSpanNames.filter(
    name => !startedSpanNames.includes(name),
  );

  if (!providerStreamErrored || missingStartedSpans.length > 0) {
    throw new Error(
      `Reproduction setup failed: providerStreamErrored=${providerStreamErrored}, missingStartedSpans=${missingStartedSpans.join(', ')}`,
    );
  }

  const missingEndedSpans = expectedSpanNames.filter(
    name => !endedSpanNames.includes(name),
  );
  const missingExportedSpans = expectedSpanNames.filter(
    name => !exportedSpanNames.includes(name),
  );

  if (missingEndedSpans.length > 0 || missingExportedSpans.length > 0) {
    console.error(
      JSON.stringify({
        startedSpanNames,
        endedSpanNames,
        exportedSpanNames,
      }),
    );
    throw new Error(
      'ISSUE #20586 REPRODUCED: provider stream error left OpenTelemetry spans open and unexported',
    );
  }

  const spansWithoutErrorStatus = exportedSpans
    .filter(span => expectedSpanNames.includes(span.name))
    .filter(span => span.status.code !== 2)
    .map(span => span.name);
  const spansWithoutException = exportedSpans
    .filter(span => expectedSpanNames.includes(span.name))
    .filter(span => !span.events.some(event => event.name === 'exception'))
    .map(span => span.name);

  if (spansWithoutErrorStatus.length > 0 || spansWithoutException.length > 0) {
    throw new Error(
      `Expected exported spans to record the error: status=${spansWithoutErrorStatus.join(', ')}, exception=${spansWithoutException.join(', ')}`,
    );
  }

  const rootSpan = exportedSpans.find(
    span => span.name === 'invoke_agent mock-model-id',
  )!;
  const stepSpan = exportedSpans.find(span => span.name === 'step 1')!;
  const chatSpan = exportedSpans.find(
    span => span.name === 'chat mock-model-id',
  )!;

  if (
    stepSpan.parentSpanContext?.spanId !== rootSpan.spanContext().spanId ||
    chatSpan.parentSpanContext?.spanId !== stepSpan.spanContext().spanId
  ) {
    throw new Error(
      'Expected exported spans to preserve the root -> step -> chat hierarchy',
    );
  }

  console.log('All streamText spans ended, recorded the error, and exported.');
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
