import { OpenTelemetry } from '@ai-sdk/otel';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-node';
import { streamText } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';

async function main() {
  const previousUnhandledRejectionListeners =
    process.listeners('unhandledRejection');
  const unhandledRejections: unknown[] = [];

  process.removeAllListeners('unhandledRejection');
  process.on('unhandledRejection', reason => {
    unhandledRejections.push(reason);
  });

  try {
    const exporter = new InMemorySpanExporter();
    const tracerProvider = new BasicTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    });
    const abortController = new AbortController();
    const callbackEvents: string[] = [];
    let pullCount = 0;

    const result = streamText({
      model: new MockLanguageModelV4({
        doStream: async () => ({
          stream: new ReadableStream({
            pull(controller) {
              switch (pullCount++) {
                case 0:
                  controller.enqueue({
                    type: 'stream-start',
                    warnings: [],
                  });
                  break;
                case 1:
                  controller.enqueue({ type: 'text-start', id: 'text-1' });
                  break;
                case 2:
                  controller.enqueue({
                    type: 'text-delta',
                    id: 'text-1',
                    delta: 'partial output',
                  });
                  break;
                case 3:
                  abortController.abort();
                  controller.error(abortController.signal.reason);
                  break;
              }
            },
          }),
        }),
      }),
      prompt: 'Generate text until the request is aborted.',
      abortSignal: abortController.signal,
      onAbort: () => {
        callbackEvents.push('onAbort');
      },
      onError: () => {
        callbackEvents.push('onError');
      },
      telemetry: {
        integrations: [
          new OpenTelemetry({
            tracer: tracerProvider.getTracer('issue-8676'),
          }),
        ],
      },
    });

    const parts = [];
    for await (const part of result.fullStream) {
      parts.push(part);
    }

    await new Promise(resolve => setTimeout(resolve, 0));

    const noOutputErrors = unhandledRejections.filter(
      reason =>
        reason instanceof Error && reason.name === 'AI_NoOutputGeneratedError',
    );
    const partTypes = parts.map(part => part.type);
    const finishedSpanCount = exporter.getFinishedSpans().length;

    if (noOutputErrors.length > 0) {
      throw new Error(
        'ISSUE_REPRODUCED: abort with instrumentation emitted AI_NoOutputGeneratedError',
      );
    }

    if (unhandledRejections.length > 0) {
      throw new Error(
        `Unexpected unhandled rejection: ${String(unhandledRejections[0])}`,
      );
    }

    if (!partTypes.includes('abort')) {
      throw new Error(`Expected an abort stream part, received: ${partTypes}`);
    }

    if (callbackEvents.length !== 1 || callbackEvents[0] !== 'onAbort') {
      throw new Error(
        `Expected only onAbort to run, received: ${callbackEvents}`,
      );
    }

    if (finishedSpanCount === 0) {
      throw new Error('OpenTelemetry instrumentation did not finish any spans');
    }

    console.log(
      JSON.stringify({
        result: 'could-not-reproduce',
        partTypes,
        callbackEvents,
        finishedSpanCount,
        unhandledRejections: unhandledRejections.length,
      }),
    );
  } finally {
    process.removeAllListeners('unhandledRejection');
    for (const listener of previousUnhandledRejectionListeners) {
      process.on('unhandledRejection', listener);
    }
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
