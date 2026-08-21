import { type DiagLogger, DiagLogLevel, diag } from '@opentelemetry/api';
import {
  InMemorySpanExporter,
  NodeTracerProvider,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-node';
import { streamText } from 'ai';
import { MockLanguageModelV2 } from 'ai/test';

const duplicateEndMessage = 'You can only call end() on a span once.';
const reproductionSignal =
  'ISSUE_18574_REPRODUCED: ai.streamText root span ended twice';

function formatDiagnostic(value: unknown): string {
  if (value instanceof Error) {
    return `${value.name}: ${value.message}`;
  }

  return typeof value === 'string' ? value : JSON.stringify(value);
}

async function main() {
  const diagnostics: string[] = [];
  const logger: DiagLogger = {
    verbose: (...args) =>
      diagnostics.push(args.map(formatDiagnostic).join(' ')),
    debug: (...args) => diagnostics.push(args.map(formatDiagnostic).join(' ')),
    info: (...args) => diagnostics.push(args.map(formatDiagnostic).join(' ')),
    warn: (...args) => diagnostics.push(args.map(formatDiagnostic).join(' ')),
    error: (...args) => diagnostics.push(args.map(formatDiagnostic).join(' ')),
  };

  diag.setLogger(logger, DiagLogLevel.ALL);

  const exporter = new InMemorySpanExporter();
  const provider = new NodeTracerProvider();
  provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
  provider.register();

  const parts: string[] = [];
  const result = streamText({
    model: new MockLanguageModelV2({
      doStream: async () => {
        throw new Error('provider blew up');
      },
    }),
    maxRetries: 0,
    prompt: 'hello',
    experimental_telemetry: { isEnabled: true },
  });

  await new Promise(resolve => setTimeout(resolve, 50));
  const rootSpansBeforeConsumption = exporter
    .getFinishedSpans()
    .filter(span => span.name === 'ai.streamText');

  for await (const part of result.fullStream) {
    parts.push(part.type);
  }

  await provider.forceFlush();

  const rootSpans = exporter
    .getFinishedSpans()
    .filter(span => span.name === 'ai.streamText');
  const duplicateEndDiagnostics = diagnostics.filter(message =>
    message.includes(duplicateEndMessage),
  );

  console.log(`stream parts: ${parts.join(',')}`);
  console.log(
    `root spans before stream consumption: ${rootSpansBeforeConsumption.length}`,
  );
  console.log(`root spans exported: ${rootSpans.length}`);
  console.log(
    `root finish reason: ${
      rootSpans[0]?.attributes['ai.response.finishReason'] ?? '<missing>'
    }`,
  );
  console.log(`duplicate-end diagnostics: ${duplicateEndDiagnostics.length}`);

  await provider.shutdown();

  const primaryBugObserved =
    parts.join(',') === 'start,error' &&
    rootSpansBeforeConsumption.length === 1 &&
    rootSpans.length === 1 &&
    duplicateEndDiagnostics.length > 0;

  if (primaryBugObserved) {
    console.error(reproductionSignal);
    process.exitCode = 1;
    return;
  }

  if (
    parts.join(',') !== 'start,error' ||
    rootSpansBeforeConsumption.length !== 0 ||
    rootSpans.length !== 1 ||
    duplicateEndDiagnostics.length !== 0
  ) {
    throw new Error(
      `Unexpected reproduction result: parts=${parts.join(
        ',',
      )}, rootSpansBeforeConsumption=${
        rootSpansBeforeConsumption.length
      }, rootSpans=${rootSpans.length}, duplicateEndDiagnostics=${
        duplicateEndDiagnostics.length
      }`,
    );
  }

  console.log('ISSUE_18574_NOT_REPRODUCED: root span ended exactly once');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
