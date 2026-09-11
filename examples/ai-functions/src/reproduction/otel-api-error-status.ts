import { createServer } from 'node:http';
import { OpenTelemetry } from '@ai-sdk/otel';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import {
  InMemorySpanExporter,
  NodeTracerProvider,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-node';
import { APICallError, generateText, RetryError } from 'ai';

const REPRODUCTION_SIGNAL =
  'ISSUE #20643 REPRODUCED: exported error spans omit provider HTTP status codes';

async function main() {
  const requestCounts = new Map<string, number>();
  const server = createServer((request, response) => {
    const path = request.url ?? '';
    requestCounts.set(path, (requestCounts.get(path) ?? 0) + 1);
    request.resume();

    const statusCode = path.startsWith('/bad-request/') ? 400 : 429;
    response.writeHead(statusCode, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        error: {
          message: `forced HTTP ${statusCode}`,
          type: 'reproduction_error',
        },
      }),
    );
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  try {
    const address = server.address();
    if (address == null || typeof address === 'string') {
      throw new Error('Local reproduction server did not expose a TCP port.');
    }

    const badRequest = await runCase({
      baseURL: `http://127.0.0.1:${address.port}/bad-request/v1`,
      expectedStatusCode: 400,
      maxRetries: 0,
      modelId: 'bad-request-model',
    });
    if (
      !APICallError.isInstance(badRequest.error) ||
      badRequest.error.statusCode !== 400
    ) {
      throw new Error(
        `Expected APICallError.statusCode 400, received ${describeError(
          badRequest.error,
        )}.`,
      );
    }

    const rateLimit = await runCase({
      baseURL: `http://127.0.0.1:${address.port}/rate-limit/v1`,
      expectedStatusCode: 429,
      maxRetries: 1,
      modelId: 'rate-limit-model',
    });
    if (
      !RetryError.isInstance(rateLimit.error) ||
      !APICallError.isInstance(rateLimit.error.lastError) ||
      rateLimit.error.lastError.statusCode !== 429
    ) {
      throw new Error(
        `Expected RetryError.lastError.statusCode 429, received ${describeError(
          rateLimit.error,
        )}.`,
      );
    }

    const badRequestPath = '/bad-request/v1/chat/completions';
    const rateLimitPath = '/rate-limit/v1/chat/completions';
    if (
      requestCounts.get(badRequestPath) !== 1 ||
      requestCounts.get(rateLimitPath) !== 2
    ) {
      throw new Error(
        `Unexpected request counts: ${JSON.stringify(
          Object.fromEntries(requestCounts),
        )}.`,
      );
    }

    console.log(
      JSON.stringify(
        {
          applicationErrors: {
            direct: {
              name: badRequest.error.name,
              statusCode: badRequest.error.statusCode,
            },
            retryExhausted: {
              name: rateLimit.error.name,
              lastErrorName: rateLimit.error.lastError.name,
              lastErrorStatusCode: rateLimit.error.lastError.statusCode,
            },
          },
          exportedChatSpans: {
            direct: summarizeSpan(badRequest.span),
            retryExhausted: summarizeSpan(rateLimit.span),
          },
        },
        null,
        2,
      ),
    );

    const missingStatuses = [
      badRequest.span.attributes['http.response.status_code'] === 400
        ? undefined
        : 400,
      rateLimit.span.attributes['http.response.status_code'] === 429
        ? undefined
        : 429,
    ].filter(statusCode => statusCode != null);

    if (missingStatuses.length > 0) {
      console.error(REPRODUCTION_SIGNAL);
      process.exitCode = 1;
      return;
    }

    console.log(
      'HTTP status codes were preserved as http.response.status_code attributes.',
    );
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close(error => {
        if (error != null) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
}

async function runCase({
  baseURL,
  expectedStatusCode,
  maxRetries,
  modelId,
}: {
  baseURL: string;
  expectedStatusCode: number;
  maxRetries: number;
  modelId: string;
}) {
  const exporter = new InMemorySpanExporter();
  const tracerProvider = new NodeTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  const telemetry = new OpenTelemetry({
    tracer: tracerProvider.getTracer(`issue-20643-${expectedStatusCode}`),
  });
  const provider = createOpenAICompatible({
    name: 'issue-20643',
    baseURL,
  });

  let error: unknown;
  try {
    await generateText({
      model: provider(modelId),
      prompt: 'Trigger the configured HTTP error.',
      maxRetries,
      telemetry: { integrations: telemetry },
    });
    throw new Error(
      `Expected the model endpoint to return HTTP ${expectedStatusCode}.`,
    );
  } catch (caughtError) {
    error = caughtError;
  }

  await tracerProvider.forceFlush();
  const span = exporter
    .getFinishedSpans()
    .find(exportedSpan => exportedSpan.name === `chat ${modelId}`);
  await tracerProvider.shutdown();

  if (span == null) {
    throw new Error(`Expected an exported chat span for ${modelId}.`);
  }
  if (
    span.status.code !== 2 ||
    !span.events.some(event => event.name === 'exception')
  ) {
    throw new Error(
      `Expected ${span.name} to record error status and exception details.`,
    );
  }

  return { error, span };
}

function summarizeSpan(span: {
  name: string;
  status: { code: number; message?: string };
  attributes: Readonly<Record<string, unknown>>;
  events: ReadonlyArray<{ name: string }>;
}) {
  return {
    name: span.name,
    status: span.status,
    exceptionRecorded: span.events.some(event => event.name === 'exception'),
    httpResponseStatusCode:
      span.attributes['http.response.status_code'] ?? null,
  };
}

function describeError(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }

  return JSON.stringify({
    name: error.name,
    message: error.message,
    statusCode: 'statusCode' in error ? error.statusCode : undefined,
  });
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
