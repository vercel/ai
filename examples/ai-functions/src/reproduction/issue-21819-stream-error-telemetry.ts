import { createGateway } from '@ai-sdk/gateway';
import { LegacyOpenTelemetry } from '@ai-sdk/otel';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-node';
import { streamText } from 'ai';

const errorMessage = 'An error occurred while processing your request.';
const errorStatusCode = 2;

type Mode = 'close' | 'abort' | 'open';

interface SpanSnapshot {
  name: string;
  statusCode: number;
  statusMessage: string | undefined;
  finishReason: unknown;
}

const delay = (milliseconds: number) =>
  new Promise(resolve => setTimeout(resolve, milliseconds));

async function run(mode: Mode): Promise<{
  sawProviderError: boolean;
  spans: SpanSnapshot[];
}> {
  const exporter = new InMemorySpanExporter();
  const provider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  let bodyController:
    | ReadableStreamDefaultController<Uint8Array<ArrayBuffer>>
    | undefined;

  const fetch = async () =>
    new Response(
      new ReadableStream<Uint8Array<ArrayBuffer>>({
        start(controller) {
          bodyController = controller;
          controller.enqueue(
            new TextEncoder().encode(
              `data: ${JSON.stringify({
                type: 'error',
                error: {
                  type: 'server_error',
                  message: errorMessage,
                },
              })}\n\n`,
            ),
          );

          if (mode === 'close') {
            setTimeout(() => controller.close(), 20);
          }
        },
      }),
      {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      },
    );

  const abortController = new AbortController();
  const result = streamText({
    model: createGateway({ apiKey: 'test-api-key', fetch })('openai/gpt-5'),
    prompt: 'hi',
    abortSignal: abortController.signal,
    telemetry: {
      isEnabled: true,
      integrations: [
        new LegacyOpenTelemetry({ tracer: provider.getTracer('ai') }),
      ],
    },
    onError: () => {},
  });

  let sawProviderError = false;

  if (mode === 'close') {
    for await (const part of result.stream) {
      if (part.type === 'error') {
        sawProviderError = true;
      }
    }
  } else {
    for await (const part of result.stream) {
      if (part.type === 'error') {
        sawProviderError = true;
        break;
      }
    }

    if (mode === 'abort') {
      abortController.abort();
    }
  }

  await delay(200);

  const spans = exporter
    .getFinishedSpans()
    .filter(
      span =>
        span.name === 'ai.streamText.doStream' || span.name === 'ai.streamText',
    )
    .map(span => ({
      name: span.name,
      statusCode: span.status.code,
      statusMessage: span.status.message,
      finishReason: span.attributes['ai.response.finishReason'],
    }));

  try {
    bodyController?.close();
  } catch {}
  await delay(20);
  await provider.shutdown();

  return { sawProviderError, spans };
}

function getSpan(spans: SpanSnapshot[], name: string) {
  return spans.find(span => span.name === name);
}

async function main() {
  const results = {
    close: await run('close'),
    abort: await run('abort'),
    open: await run('open'),
  };

  for (const [mode, result] of Object.entries(results)) {
    if (!result.sawProviderError) {
      throw new Error(
        `REPRODUCTION_SETUP_FAILED: ${mode} did not receive the provider error part`,
      );
    }
  }

  const failures: string[] = [];
  const closedStepSpan = getSpan(results.close.spans, 'ai.streamText.doStream');

  if (closedStepSpan == null) {
    failures.push('close: doStream span was not exported');
  } else {
    if (closedStepSpan.finishReason !== 'error') {
      throw new Error(
        `REPRODUCTION_SETUP_FAILED: close finishReason was ${String(closedStepSpan.finishReason)}`,
      );
    }
    if (closedStepSpan.statusCode !== errorStatusCode) {
      failures.push(
        `close: doStream status was ${closedStepSpan.statusCode}, expected ERROR (${errorStatusCode})`,
      );
    }
    if (closedStepSpan.statusMessage !== errorMessage) {
      failures.push(
        `close: doStream status message was ${JSON.stringify(closedStepSpan.statusMessage)}, expected ${JSON.stringify(errorMessage)}`,
      );
    }
  }

  for (const mode of ['abort', 'open'] as const) {
    for (const spanName of ['ai.streamText.doStream', 'ai.streamText']) {
      if (getSpan(results[mode].spans, spanName) == null) {
        failures.push(`${mode}: ${spanName} span was not exported`);
      }
    }
  }

  console.log(JSON.stringify(results, null, 2));

  if (failures.length > 0) {
    console.error(failures.map(failure => `- ${failure}`).join('\n'));
    throw new Error(
      'ISSUE_REPRODUCED: in-stream provider errors are not exported as ended ERROR telemetry spans',
    );
  }

  console.log(
    'PASS: in-stream provider errors export ended ERROR telemetry spans',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
