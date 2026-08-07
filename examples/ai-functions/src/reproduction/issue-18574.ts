import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  InMemorySpanExporter,
  NodeTracerProvider,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-node';
import { streamText } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';

const failureSignal =
  'REPRODUCED issue #18574: ai.streamText root span emitted the ended-span diagnostic';

const requireFromOtel = createRequire(
  require.resolve('@opentelemetry/sdk-trace-node'),
);
const { diag, DiagLogLevel } = requireFromOtel('@opentelemetry/api') as {
  diag: {
    setLogger(logger: CapturingDiagLogger, logLevel: number): void;
  };
  DiagLogLevel: { ALL: number };
};

class CapturingDiagLogger {
  readonly entries: string[] = [];

  private capture(...args: unknown[]) {
    this.entries.push(
      args
        .map(value =>
          value instanceof Error
            ? `${value.name}: ${value.message}`
            : String(value),
        )
        .join(' '),
    );
  }

  error(...args: unknown[]) {
    this.capture(...args);
  }

  warn(...args: unknown[]) {
    this.capture(...args);
  }

  info(...args: unknown[]) {
    this.capture(...args);
  }

  debug(...args: unknown[]) {
    this.capture(...args);
  }

  verbose(...args: unknown[]) {
    this.capture(...args);
  }
}

async function main() {
  const logger = new CapturingDiagLogger();
  diag.setLogger(logger, DiagLogLevel.ALL);

  const exporter = new InMemorySpanExporter();
  const provider = new NodeTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  provider.register();
  const tracer = provider.getTracer('issue-18574');

  const result = streamText({
    model: new MockLanguageModelV3({
      doStream: async () => {
        throw new Error('provider blew up');
      },
    }),
    prompt: 'hello',
    maxRetries: 0,
    experimental_telemetry: { isEnabled: true, tracer },
  });

  const partTypes: string[] = [];
  for await (const part of result.fullStream) {
    partTypes.push(part.type);
  }

  await provider.forceFlush();

  assert.deepEqual(partTypes, ['start', 'error']);

  const rootSpans = exporter
    .getFinishedSpans()
    .filter(span => span.name === 'ai.streamText');
  assert.equal(rootSpans.length, 1);
  assert.equal(rootSpans[0].status.message, 'provider blew up');
  assert.equal(rootSpans[0].attributes['ai.response.finishReason'], undefined);

  const diagnostics = logger.entries.join('\n');
  const hasEndedSpanOperation = diagnostics.includes(
    'Cannot execute the operation on ended Span',
  );
  const hasDuplicateEnd = diagnostics.includes(
    'You can only call end() on a span once.',
  );

  await provider.shutdown();

  if (hasEndedSpanOperation && hasDuplicateEnd) {
    console.error(failureSignal);
    process.exitCode = 1;
    return;
  }

  console.log(
    'Issue #18574 not observed: the failed ai.streamText root span did not emit a duplicate-end diagnostic.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 2;
});
