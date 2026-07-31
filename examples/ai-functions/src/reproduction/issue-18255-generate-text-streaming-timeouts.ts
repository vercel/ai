import { generateText, streamText } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';

const DEADLINE_MS = 100;
const WATCHDOG_MS = 500;

type ProbeResult = {
  elapsedMs: number;
  outcome: 'resolved' | 'rejected' | 'watchdog';
  errorName?: string;
};

function createStallingModel() {
  let generateAbortSignal: AbortSignal | undefined;

  return {
    get generateAbortSignal() {
      return generateAbortSignal;
    },
    model: new MockLanguageModelV4({
      doGenerate: async ({ abortSignal }) => {
        generateAbortSignal = abortSignal;

        return await new Promise((_resolve, reject) => {
          if (abortSignal?.aborted) {
            reject(abortSignal.reason);
          } else {
            abortSignal?.addEventListener(
              'abort',
              () => reject(abortSignal.reason),
              { once: true },
            );
          }
        });
      },
      doStream: async ({ abortSignal }) => ({
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({ type: 'stream-start', warnings: [] });

            if (abortSignal?.aborted) {
              controller.error(abortSignal.reason);
            } else {
              abortSignal?.addEventListener(
                'abort',
                () => controller.error(abortSignal.reason),
                { once: true },
              );
            }
          },
        }),
      }),
    }),
  };
}

async function probe(run: () => Promise<unknown>): Promise<ProbeResult> {
  const startedAt = Date.now();
  let watchdogId: ReturnType<typeof setTimeout> | undefined;

  const result = await Promise.race([
    run().then(
      () => ({ outcome: 'resolved' as const }),
      (error: unknown) => ({
        outcome: 'rejected' as const,
        errorName: error instanceof Error ? error.name : typeof error,
      }),
    ),
    new Promise<{ outcome: 'watchdog' }>(resolve => {
      watchdogId = setTimeout(
        () => resolve({ outcome: 'watchdog' }),
        WATCHDOG_MS,
      );
    }),
  ]);

  if (watchdogId != null) {
    clearTimeout(watchdogId);
  }

  return {
    ...result,
    elapsedMs: Date.now() - startedAt,
  };
}

async function main() {
  const loggedWarnings: unknown[] = [];
  const previousWarningLogger = globalThis.AI_SDK_LOG_WARNINGS;
  globalThis.AI_SDK_LOG_WARNINGS = options => {
    loggedWarnings.push(...options.warnings);
  };

  try {
    const firstChunkCase = createStallingModel();
    const firstChunkResult = await probe(() =>
      generateText({
        model: firstChunkCase.model,
        prompt: 'Hello!',
        timeout: { firstChunkMs: DEADLINE_MS },
        maxRetries: 0,
      }),
    );
    const firstChunkWarningCount = loggedWarnings.length;

    const chunkCase = createStallingModel();
    const warningsBeforeChunk = loggedWarnings.length;
    const chunkResult = await probe(() =>
      generateText({
        model: chunkCase.model,
        prompt: 'Hello!',
        timeout: { chunkMs: DEADLINE_MS },
        maxRetries: 0,
      }),
    );
    const chunkWarningCount = loggedWarnings.length - warningsBeforeChunk;

    const stepCase = createStallingModel();
    const stepResult = await probe(() =>
      generateText({
        model: stepCase.model,
        prompt: 'Hello!',
        timeout: { stepMs: DEADLINE_MS },
        maxRetries: 0,
      }),
    );

    const totalCase = createStallingModel();
    const totalResult = await probe(() =>
      generateText({
        model: totalCase.model,
        prompt: 'Hello!',
        timeout: { totalMs: DEADLINE_MS },
        maxRetries: 0,
      }),
    );

    const streamFirstChunkCase = createStallingModel();
    const streamFirstChunkResult = await probe(async () => {
      const result = streamText({
        model: streamFirstChunkCase.model,
        prompt: 'Hello!',
        timeout: { firstChunkMs: DEADLINE_MS },
        maxRetries: 0,
        onError: () => {},
      });

      for await (const _part of result.fullStream) {
        // Drain until the first-chunk timeout aborts the stream.
      }
    });

    const streamChunkCase = createStallingModel();
    const streamChunkResult = await probe(async () => {
      const result = streamText({
        model: streamChunkCase.model,
        prompt: 'Hello!',
        timeout: { chunkMs: DEADLINE_MS },
        maxRetries: 0,
        onError: () => {},
      });

      for await (const _part of result.fullStream) {
        // chunkMs is only armed after content starts, so this is a known no-op.
      }
    });

    const results = {
      deadlineMs: DEADLINE_MS,
      watchdogMs: WATCHDOG_MS,
      generateText: {
        firstChunkMs: {
          ...firstChunkResult,
          warningCount: firstChunkWarningCount,
          modelReceivedAbortSignal: firstChunkCase.generateAbortSignal != null,
        },
        chunkMs: {
          ...chunkResult,
          warningCount: chunkWarningCount,
          modelReceivedAbortSignal: chunkCase.generateAbortSignal != null,
        },
        stepMsControl: stepResult,
        totalMsControl: totalResult,
      },
      streamText: {
        firstChunkMsControl: streamFirstChunkResult,
        chunkMsKnownNoOp: streamChunkResult,
      },
    };

    console.log(JSON.stringify(results, null, 2));

    const controlsWorked =
      stepResult.outcome === 'rejected' &&
      stepResult.errorName === 'TimeoutError' &&
      totalResult.outcome === 'rejected' &&
      totalResult.errorName === 'TimeoutError' &&
      streamFirstChunkResult.outcome === 'resolved' &&
      streamChunkResult.outcome === 'watchdog';

    if (!controlsWorked) {
      throw new Error(
        'Reproduction controls failed; timeout behavior could not be evaluated.',
      );
    }

    const issueReproduced =
      firstChunkResult.outcome === 'watchdog' &&
      firstChunkWarningCount === 0 &&
      firstChunkCase.generateAbortSignal == null &&
      chunkResult.outcome === 'watchdog' &&
      chunkWarningCount === 0 &&
      chunkCase.generateAbortSignal == null;

    if (issueReproduced) {
      throw new Error(
        'Reproduced issue #18255: generateText accepted firstChunkMs and chunkMs but emitted no warning and both calls exceeded their configured deadlines',
      );
    }
  } finally {
    globalThis.AI_SDK_LOG_WARNINGS = previousWarningLogger;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
