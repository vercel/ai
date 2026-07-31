import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import * as Sentry from '@sentry/node';
import type * as Ai from 'ai';
import type * as AiTest from 'ai/test';

async function main() {
  const scenario = process.env.ISSUE_8676_SCENARIO;

  if (scenario == null) {
    const scriptPath = fileURLToPath(import.meta.url);
    const instrumentationPath = fileURLToPath(
      new URL('./issue-8676-sentry-init.ts', import.meta.url),
    );
    const packagePath = fileURLToPath(
      new URL('../../../../packages/ai', import.meta.url),
    );
    const installedPackageRoot = mkdtempSync(
      join(dirname(scriptPath), '.issue-8676-'),
    );
    const installedAiPath = join(installedPackageRoot, 'node_modules', 'ai');

    mkdirSync(installedAiPath, { recursive: true });
    cpSync(
      join(packagePath, 'package.json'),
      join(installedAiPath, 'package.json'),
    );
    cpSync(join(packagePath, 'dist'), join(installedAiPath, 'dist'), {
      recursive: true,
    });

    try {
      for (const childScenario of ['otel', 'sentry'] as const) {
        const child = spawnSync(
          process.execPath,
          [
            '--import',
            'tsx',
            ...(childScenario === 'sentry'
              ? ['--import', instrumentationPath]
              : []),
            scriptPath,
          ],
          {
            encoding: 'utf8',
            env: {
              ...process.env,
              ISSUE_8676_MODULE_ROOT: installedPackageRoot,
              ISSUE_8676_SCENARIO: childScenario,
            },
          },
        );

        process.stdout.write(child.stdout);
        process.stderr.write(child.stderr);

        if (child.error != null) {
          throw child.error;
        }

        if (child.status !== 0) {
          process.exitCode = child.status ?? 1;
          return;
        }
      }
      return;
    } finally {
      rmSync(installedPackageRoot, { recursive: true, force: true });
    }
  }

  const moduleRoot = process.env.ISSUE_8676_MODULE_ROOT;
  if (moduleRoot == null) {
    throw new Error('Missing installed AI SDK module root');
  }

  const require = createRequire(join(moduleRoot, 'entry.cjs'));
  const unhandledRejections: unknown[] = [];
  const onUnhandledRejection = (reason: unknown) => {
    unhandledRejections.push(reason);
  };

  process.on('unhandledRejection', onUnhandledRejection);

  const tracerProvider =
    scenario === 'otel' ? new NodeTracerProvider() : undefined;
  tracerProvider?.register();

  const sentryIntegration =
    scenario === 'sentry'
      ? Sentry.getClient()?.getIntegrationByName('VercelAI')
      : undefined;

  if (scenario === 'sentry' && sentryIntegration == null) {
    throw new Error('Sentry VercelAI default instrumentation is not active');
  }

  // The copied package gives Sentry the installed node_modules layout that its
  // module instrumentation expects while still running the checked-out build.
  const { NoOutputGeneratedError, streamText } = require('ai') as typeof Ai;
  const { MockLanguageModelV3 } = require('ai/test') as typeof AiTest;

  const abortController = new AbortController();
  const streamParts: string[] = [];
  let onAbortCalls = 0;
  let onErrorCalls = 0;
  let onFinishCalls = 0;
  let pullCalls = 0;

  const settings: Parameters<typeof streamText>[0] = {
    abortSignal: abortController.signal,
    model: new MockLanguageModelV3({
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
                abortController.abort();
                controller.error(
                  new DOMException('The user aborted a request.', 'AbortError'),
                );
                break;
            }
          },
        }),
      }),
    }),
    prompt: 'Write a long response.',
    onAbort: () => {
      onAbortCalls++;
    },
    onError: () => {
      onErrorCalls++;
    },
    onFinish: () => {
      onFinishCalls++;
    },
    ...(scenario === 'otel'
      ? { experimental_telemetry: { isEnabled: true } }
      : {}),
  };

  const result = streamText(settings);

  if (
    scenario === 'sentry' &&
    settings.experimental_telemetry?.isEnabled !== true
  ) {
    throw new Error('Sentry did not enable AI SDK telemetry');
  }

  for await (const part of result.fullStream) {
    streamParts.push(part.type);
  }

  // Give Node enough turns to report any rejected result promise that was not
  // handled by the caller or instrumentation.
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));

  process.off('unhandledRejection', onUnhandledRejection);
  await tracerProvider?.shutdown();
  if (scenario === 'sentry') {
    await Sentry.close(100);
  }

  const sentryEnvelopeItemTypes =
    scenario === 'sentry'
      ? (
          (
            globalThis as typeof globalThis & {
              issue8676SentryEnvelopes?: unknown[];
            }
          ).issue8676SentryEnvelopes ?? []
        ).flatMap(envelope => {
          if (!Array.isArray(envelope) || !Array.isArray(envelope[1])) {
            return [];
          }

          return envelope[1].flatMap(item =>
            Array.isArray(item) &&
            typeof item[0] === 'object' &&
            item[0] != null &&
            'type' in item[0] &&
            typeof item[0].type === 'string'
              ? [item[0].type]
              : [],
          );
        })
      : [];
  const sentryCapturedErrorEvents = sentryEnvelopeItemTypes.filter(
    type => type === 'event',
  ).length;

  const noOutputRejections = unhandledRejections.filter(error =>
    NoOutputGeneratedError.isInstance(error),
  );
  const abortRejections = unhandledRejections.filter(
    error => error instanceof DOMException && error.name === 'AbortError',
  );

  console.log(
    JSON.stringify(
      {
        scenario,
        aiVersion: require('ai/package.json').version,
        ...(scenario === 'sentry'
          ? {
              sentryVersion: require('@sentry/node/package.json').version,
              sentryInstrumentation: sentryIntegration?.name,
              telemetryEnabledBySentry:
                settings.experimental_telemetry?.isEnabled,
              sentryEnvelopeItemTypes,
              sentryCapturedErrorEvents,
            }
          : {}),
        streamParts,
        onAbortCalls,
        onErrorCalls,
        onFinishCalls,
        unhandledRejections: unhandledRejections.map(error =>
          error instanceof Error
            ? { name: error.name, message: error.message }
            : String(error),
        ),
      },
      null,
      2,
    ),
  );

  if (noOutputRejections.length > 0) {
    throw new Error(
      `Unexpected AI_NoOutputGeneratedError in ${scenario} scenario`,
    );
  }

  if (
    !streamParts.includes('abort') ||
    onAbortCalls !== 1 ||
    onErrorCalls !== 0 ||
    onFinishCalls !== 0
  ) {
    throw new Error('Instrumented stream abort did not complete normally');
  }

  if (scenario === 'otel' && unhandledRejections.length !== 0) {
    throw new Error('Plain OpenTelemetry abort had an unhandled rejection');
  }

  if (
    scenario === 'sentry' &&
    (unhandledRejections.length !== 1 ||
      abortRejections.length !== 1 ||
      sentryCapturedErrorEvents !== 0)
  ) {
    throw new Error(
      'Sentry comparison did not ignore the abort rejection as expected',
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
