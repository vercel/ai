import { experimental_generateVideo as generateVideo } from 'ai';
import { MockVideoModelV4 } from 'ai/test';

const sleep = (ms: number) =>
  new Promise<void>(resolve => setTimeout(resolve, ms));

type Outcome = {
  state: 'pending' | 'resolved' | 'rejected';
};

async function checkStalledStatusRequest() {
  const timeoutMs = 50;
  const caller = new AbortController();
  let resolveEntered!: () => void;
  const entered = new Promise<void>(resolve => {
    resolveEntered = resolve;
  });
  const outcome: Outcome = { state: 'pending' };
  let statusSignal: AbortSignal | undefined;

  const generation = generateVideo({
    model: new MockVideoModelV4({
      doGenerate: undefined,
      doStart: async () => ({
        operation: 'stalled-operation',
        warnings: [],
        response: {
          timestamp: new Date(),
          modelId: 'synthetic-video',
          headers: {},
        },
      }),
      doStatus: ({ abortSignal }) => {
        statusSignal = abortSignal;

        return new Promise((_resolve, reject) => {
          if (abortSignal?.aborted) {
            reject(abortSignal.reason);
          } else {
            abortSignal?.addEventListener(
              'abort',
              () => reject(abortSignal.reason),
              { once: true },
            );
          }
          resolveEntered();
        });
      },
    }),
    prompt: 'Synthetic prompt.',
    maxRetries: 0,
    abortSignal: caller.signal,
    poll: { intervalMs: 0, timeoutMs },
  }).then(
    () => {
      outcome.state = 'resolved';
    },
    () => {
      outcome.state = 'rejected';
    },
  );

  await entered;
  await sleep(200);

  const observed = {
    state: outcome.state,
    statusRequestAborted: statusSignal?.aborted === true,
  };

  caller.abort(new Error('Synthetic cleanup'));
  await generation;

  return observed;
}

async function checkLateCompletedStatus() {
  const timeoutMs = 50;
  const statusDelayMs = 300;
  const outcome: Outcome = { state: 'pending' };
  let statusSignal: AbortSignal | undefined;

  const startTime = Date.now();
  await generateVideo({
    model: new MockVideoModelV4({
      doGenerate: undefined,
      doStart: async () => ({
        operation: 'late-operation',
        warnings: [],
        response: {
          timestamp: new Date(),
          modelId: 'synthetic-video',
          headers: {},
        },
      }),
      doStatus: async ({ abortSignal }) => {
        statusSignal = abortSignal;
        await sleep(statusDelayMs);

        return {
          status: 'completed' as const,
          videos: [
            {
              type: 'base64' as const,
              data: 'AAAA',
              mediaType: 'video/mp4',
            },
          ],
          warnings: [],
          response: {
            timestamp: new Date(),
            modelId: 'synthetic-video',
            headers: {},
          },
        };
      },
    }),
    prompt: 'Synthetic prompt.',
    maxRetries: 0,
    poll: { intervalMs: 0, timeoutMs },
  }).then(
    () => {
      outcome.state = 'resolved';
    },
    () => {
      outcome.state = 'rejected';
    },
  );

  return {
    state: outcome.state,
    statusRequestAborted: statusSignal?.aborted === true,
    elapsedMs: Date.now() - startTime,
    maximumExpectedElapsedMs: 200,
  };
}

async function main() {
  const stalled = await checkStalledStatusRequest();
  const lateCompleted = await checkLateCompletedStatus();

  const stalledRequestBug =
    stalled.state === 'pending' && !stalled.statusRequestAborted;
  const lateCompletionBug =
    lateCompleted.state === 'resolved' &&
    !lateCompleted.statusRequestAborted &&
    lateCompleted.elapsedMs >= lateCompleted.maximumExpectedElapsedMs;

  if (stalledRequestBug && lateCompletionBug) {
    throw new Error(
      'ISSUE_21053_REPRODUCED: poll.timeoutMs neither cancelled a stalled doStatus request nor rejected a completed result returned after the deadline',
    );
  }

  const stalledRequestFixed =
    stalled.state === 'rejected' && stalled.statusRequestAborted;
  const lateCompletionFixed =
    lateCompleted.state === 'rejected' &&
    lateCompleted.statusRequestAborted &&
    lateCompleted.elapsedMs < lateCompleted.maximumExpectedElapsedMs;

  if (!stalledRequestFixed || !lateCompletionFixed) {
    throw new Error(
      `Unexpected partial result: ${JSON.stringify({ stalled, lateCompleted })}`,
    );
  }

  console.log('poll.timeoutMs bounded and cancelled both status requests');
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
