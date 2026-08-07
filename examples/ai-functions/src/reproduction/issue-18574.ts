import {
  DiagLogLevel,
  SpanStatusCode,
  diag,
  type DiagLogger,
  type Span,
  type Tracer,
} from '../../../../packages/otel/node_modules/@opentelemetry/api/build/src/index.js';
import {
  InMemorySpanExporter,
  NodeTracerProvider,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-node';
import { LegacyOpenTelemetry } from '@ai-sdk/otel';
import assert from 'node:assert/strict';
import { streamText } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { recordSpan } from '../../../../packages/otel/src/record-span';

type TrackedSpan = {
  endCalls: number;
  name: string;
  span: Span;
};

function stringifyDiagnostic(value: unknown): string {
  if (value instanceof Error) {
    return `${value.name}: ${value.message}`;
  }

  return typeof value === 'string' ? value : JSON.stringify(value);
}

async function main() {
  const diagnostics: string[] = [];
  const collectDiagnostic = (...values: unknown[]) => {
    diagnostics.push(values.map(stringifyDiagnostic).join(' '));
  };
  const diagnosticLogger: DiagLogger = {
    error: collectDiagnostic,
    warn: collectDiagnostic,
    info: collectDiagnostic,
    debug: collectDiagnostic,
    verbose: collectDiagnostic,
  };
  diag.setLogger(diagnosticLogger, DiagLogLevel.ALL);

  const exporter = new InMemorySpanExporter();
  const provider = new NodeTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  provider.register();

  const delegateTracer = provider.getTracer('issue-18574');
  const trackedSpans: TrackedSpan[] = [];
  const tracer: Tracer = {
    startSpan(name, options, context) {
      const span = delegateTracer.startSpan(name, options, context);
      const trackedSpan = { endCalls: 0, name, span };
      const originalEnd = span.end.bind(span);

      span.end = endTime => {
        trackedSpan.endCalls += 1;
        originalEnd(endTime);
      };

      trackedSpans.push(trackedSpan);
      return span;
    },
    startActiveSpan: delegateTracer.startActiveSpan.bind(delegateTracer),
  };

  const diagnosticStartIndex = diagnostics.length;
  const result = streamText({
    model: new MockLanguageModelV4({
      doStream: async () => {
        throw new Error('provider blew up');
      },
    }),
    prompt: 'hello',
    maxRetries: 0,
    onError: () => {},
    experimental_telemetry: {
      isEnabled: true,
      integrations: new LegacyOpenTelemetry({ tracer }),
    },
  });

  const partTypes: string[] = [];
  for await (const part of result.fullStream) {
    partTypes.push(part.type);
  }
  await provider.forceFlush();

  const streamDiagnostics = diagnostics.slice(diagnosticStartIndex);
  const endedSpanDiagnostic = streamDiagnostics.find(message =>
    /Cannot execute the operation on ended Span|Operation attempted on ended Span|You can only call end\(\) on a span once/.test(
      message,
    ),
  );
  const trackedRootSpans = trackedSpans.filter(
    span => span.name === 'ai.streamText',
  );
  const exportedRootSpans = exporter
    .getFinishedSpans()
    .filter(span => span.name === 'ai.streamText');

  assert.deepEqual(partTypes, ['start', 'error']);
  assert.equal(
    endedSpanDiagnostic,
    undefined,
    `streamText emitted an ended-span diagnostic: ${endedSpanDiagnostic}`,
  );
  assert.equal(trackedRootSpans.length, 1);
  assert.equal(
    trackedRootSpans[0].endCalls,
    1,
    `ai.streamText root span ended ${trackedRootSpans[0].endCalls} times`,
  );
  assert.equal(exportedRootSpans.length, 1);
  assert.equal(exportedRootSpans[0].status.code, SpanStatusCode.ERROR);

  console.log(
    'PRIMARY_NOT_REPRODUCED: failed streamText ended its root span exactly once without an ended-span diagnostic',
  );

  let deferredSpan: Span | undefined;
  await assert.rejects(
    recordSpan({
      name: 'issue-18574-record-span',
      tracer: delegateTracer,
      attributes: {},
      endWhenDone: false,
      fn: async span => {
        deferredSpan = span;
        throw new Error('recordSpan failure');
      },
    }),
    /recordSpan failure/,
  );

  assert.ok(deferredSpan);
  assert.equal(
    deferredSpan.isRecording(),
    false,
    'recordSpan unexpectedly left the span open after rejection',
  );
  console.log(
    'SECONDARY_REPRODUCED: recordSpan ended its span after rejection despite endWhenDone=false',
  );

  await provider.shutdown();
  diag.disable();
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
