import { LegacyOpenTelemetry } from '@ai-sdk/otel';
import {
  NodeTracerProvider,
  SimpleSpanProcessor,
  type ReadableSpan,
  type SpanExporter,
} from '@opentelemetry/sdk-trace-node';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { openSync } from 'node:fs';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { streamObject } from 'ai';
import { convertArrayToReadableStream, MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod/v4';

const collectorVersion = '0.156.0';
const collectorDirectory = join(
  tmpdir(),
  `ai-sdk-issue-6546-otelcol-${collectorVersion}`,
);
const collectorBinary = join(collectorDirectory, 'otelcol');
const collectorArchive = join(collectorDirectory, 'otelcol.tar.gz');

type ExportResult = {
  code: number;
  error?: Error;
};

type OtlpTraceExporter = {
  export(
    spans: ReadableSpan[],
    resultCallback: (result: ExportResult) => void,
  ): void;
  forceFlush?(): Promise<void>;
  shutdown(): Promise<void>;
};

type OtlpTraceExporterConstructor = new (options: {
  url: string;
}) => OtlpTraceExporter;

async function downloadCollector(): Promise<void> {
  try {
    await access(collectorBinary);
    return;
  } catch {
    // Download the official collector release below.
  }

  await mkdir(collectorDirectory, { recursive: true });

  const response = await fetch(
    `https://github.com/open-telemetry/opentelemetry-collector-releases/releases/download/v${collectorVersion}/otelcol_${collectorVersion}_linux_arm64.tar.gz`,
  );

  if (!response.ok || response.body == null) {
    throw new Error(
      `Failed to download OpenTelemetry Collector ${collectorVersion}: ${response.status} ${response.statusText}`,
    );
  }

  await writeFile(collectorArchive, Buffer.from(await response.arrayBuffer()));

  await new Promise<void>((resolve, reject) => {
    const tar = spawn('tar', [
      '-xzf',
      collectorArchive,
      '-C',
      collectorDirectory,
    ]);
    tar.once('error', reject);
    tar.once('exit', code => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`tar exited with code ${code}`));
      }
    });
  });
}

async function getFreePort(): Promise<number> {
  const server = createServer();

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  assert.ok(address != null && typeof address === 'object');
  const port = address.port;

  await closeServer(server);
  return port;
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close(error => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function waitForCollector(
  port: number,
  collectorProcess: ReturnType<typeof spawn>,
): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (collectorProcess.exitCode != null) {
      throw new Error(
        `OpenTelemetry Collector exited with code ${collectorProcess.exitCode}`,
      );
    }

    try {
      await fetch(`http://127.0.0.1:${port}/`);
      return;
    } catch {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  throw new Error('Timed out waiting for OpenTelemetry Collector');
}

async function stopProcess(process: ReturnType<typeof spawn>): Promise<void> {
  if (process.exitCode != null) return;

  process.kill('SIGTERM');

  await Promise.race([
    new Promise<void>(resolve => process.once('exit', () => resolve())),
    new Promise<void>(resolve =>
      setTimeout(() => {
        process.kill('SIGKILL');
        resolve();
      }, 5_000),
    ),
  ]);
}

async function main(): Promise<void> {
  await downloadCollector();

  const collectorPort = await getFreePort();
  const proxyPort = await getFreePort();
  const collectorConfig = join(collectorDirectory, 'issue-6546-config.yaml');
  const collectorLog = join(collectorDirectory, 'issue-6546-collector.log');

  await writeFile(
    collectorConfig,
    `receivers:
  otlp:
    protocols:
      http:
        endpoint: 127.0.0.1:${collectorPort}
exporters:
  debug:
    verbosity: basic
service:
  pipelines:
    traces:
      receivers: [otlp]
      exporters: [debug]
`,
  );

  const collectorLogFd = openSync(collectorLog, 'w');
  const collectorProcess = spawn(
    collectorBinary,
    ['--config', collectorConfig],
    {
      stdio: ['ignore', collectorLogFd, collectorLogFd],
    },
  );

  const payloads: string[] = [];
  const collectorResponses: Array<{ status: number; body: string }> = [];
  const proxy = createServer(async (request, response) => {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of request) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }

      const body = Buffer.concat(chunks);
      payloads.push(body.toString('utf8'));

      const collectorResponse = await fetch(
        `http://127.0.0.1:${collectorPort}/v1/traces`,
        {
          method: 'POST',
          headers: {
            'content-type':
              request.headers['content-type'] ?? 'application/json',
          },
          body,
        },
      );
      const collectorResponseBody = await collectorResponse.text();

      collectorResponses.push({
        status: collectorResponse.status,
        body: collectorResponseBody,
      });

      response.statusCode = collectorResponse.status;
      response.setHeader(
        'content-type',
        collectorResponse.headers.get('content-type') ?? 'application/json',
      );
      response.end(collectorResponseBody);
    } catch (error) {
      response.statusCode = 502;
      response.end(error instanceof Error ? error.message : String(error));
    }
  });

  let tracerProvider: NodeTracerProvider | undefined;

  try {
    await waitForCollector(collectorPort, collectorProcess);

    await new Promise<void>((resolve, reject) => {
      proxy.once('error', reject);
      proxy.listen(proxyPort, '127.0.0.1', resolve);
    });

    const require = createRequire(import.meta.url);
    const requireFromSdkNode = createRequire(
      require.resolve('@opentelemetry/sdk-node'),
    );
    const { OTLPTraceExporter } = requireFromSdkNode(
      '@opentelemetry/exporter-trace-otlp-http',
    ) as {
      OTLPTraceExporter: OtlpTraceExporterConstructor;
    };

    const otlpExporter = new OTLPTraceExporter({
      url: `http://127.0.0.1:${proxyPort}/v1/traces`,
    });
    const exportResults: ExportResult[] = [];

    const recordingExporter: SpanExporter = {
      export(spans, resultCallback) {
        otlpExporter.export(spans, result => {
          exportResults.push(result);
          resultCallback(result);
        });
      },
      forceFlush: () => otlpExporter.forceFlush?.() ?? Promise.resolve(),
      shutdown: () => otlpExporter.shutdown(),
    };

    tracerProvider = new NodeTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(recordingExporter)],
    });

    const result = streamObject({
      model: new MockLanguageModelV4({
        provider: 'openai.chat',
        modelId: 'o4-mini',
        doStream: async () => ({
          stream: convertArrayToReadableStream([
            { type: 'stream-start', warnings: [] },
            { type: 'text-start', id: 'text-1' },
            {
              type: 'text-delta',
              id: 'text-1',
              delta: '{"elements":[{"names":["Dawid","Michal","Kasia"]}]}',
            },
            { type: 'text-end', id: 'text-1' },
            {
              type: 'finish',
              finishReason: { raw: 'stop', unified: 'stop' },
              usage: {
                inputTokens: {
                  total: NaN,
                  noCache: NaN,
                  cacheRead: undefined,
                  cacheWrite: undefined,
                },
                outputTokens: {
                  total: NaN,
                  text: NaN,
                  reasoning: undefined,
                },
              },
            },
          ]),
        }),
      }),
      output: 'array',
      schema: z.object({
        names: z.array(z.string()),
      }),
      prompt: 'Write down all names from the input.',
      telemetry: {
        functionId: 'issue-6546',
        integrations: new LegacyOpenTelemetry({
          tracer: tracerProvider.getTracer('issue-6546'),
        }),
      },
    });

    for await (const element of result.elementStream) {
      console.log('streamed element:', element);
    }

    await tracerProvider.forceFlush();

    const invalidPayloads = payloads.filter(
      payload =>
        payload.includes('"doubleValue":null') &&
        [
          'ai.usage.inputTokens',
          'ai.usage.outputTokens',
          'gen_ai.usage.input_tokens',
          'gen_ai.usage.output_tokens',
        ].some(attribute => payload.includes(`"key":"${attribute}"`)),
    );
    const rejectedResponses = collectorResponses.filter(
      response => response.status === 400,
    );
    const failedExports = exportResults.filter(result => result.code !== 0);

    console.log(
      JSON.stringify(
        {
          invalidPayloadCount: invalidPayloads.length,
          collectorResponses,
          failedExportCount: failedExports.length,
          collectorLog,
        },
        null,
        2,
      ),
    );

    assert.equal(
      invalidPayloads.length,
      0,
      'Issue #6546 reproduced: the AI SDK emitted non-finite token counts as OTLP-JSON doubleValue:null.',
    );
    assert.equal(
      rejectedResponses.length,
      0,
      'Issue #6546 reproduced: OpenTelemetry Collector rejected the trace payload with HTTP 400.',
    );
    assert.equal(
      failedExports.length,
      0,
      'Issue #6546 reproduced: the OTLP trace exporter reported a failed export.',
    );
  } finally {
    await tracerProvider?.shutdown().catch(() => {});
    if (proxy.listening) {
      await closeServer(proxy).catch(() => {});
    }
    await stopProcess(collectorProcess);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
