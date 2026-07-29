import { Buffer } from 'node:buffer';
import { Worker } from 'node:worker_threads';
import { describe, expect, it } from 'vitest';
import * as workerSourceModule from '../dist/runtime/worker-source.js';

const { INLINE_CODE_MODE_WORKER_SOURCE } = workerSourceModule as {
  INLINE_CODE_MODE_WORKER_SOURCE: string;
};

const WORKER_OPTIONS = {
  timeoutMs: 1_000,
  memoryLimitBytes: 64 * 1024 * 1024,
  maxStackSizeBytes: 2 * 1024 * 1024,
  maxResultBytes: 1024 * 1024,
  fetchEnabled: false,
};
const WORKER_DETERMINISM = {
  dateNowMs: 1_700_000_000_000,
  randomSeed: 123,
};

describe('worker protocol hardening', () => {
  it('rejects bridge responses with unknown request IDs', async () => {
    const worker = createWorker();
    try {
      const errorPromise = waitForWorkerError(worker);
      worker.postMessage({
        type: 'bridge-response',
        invocationId: 'invocation-a',
        requestId: 'missing-request',
        success: true,
        dateNowMs: Date.now(),
        valueJson: '"accepted"',
      }); // eslint-disable-line unicorn/require-post-message-target-origin -- Node.js Worker has no targetOrigin parameter.

      const error = await errorPromise;
      expect(error.message).toBe(
        'Unexpected bridge response requestId: missing-request.',
      );
    } finally {
      await worker.terminate();
    }
  });

  it('rejects bridge responses whose invocation ID does not match the request', async () => {
    const worker = createWorker();
    try {
      const errorPromise = waitForWorkerError(worker);
      const requestPromise = waitForWorkerMessage(
        worker,
        (message): message is { type: 'tool-request'; requestId: string } =>
          message.type === 'tool-request',
      );

      worker.postMessage({
        type: 'run',
        invocationId: 'invocation-a',
        js: 'return await tools.echo({ value: 1 });',
        determinism: WORKER_DETERMINISM,
        options: WORKER_OPTIONS,
      }); // eslint-disable-line unicorn/require-post-message-target-origin -- Node.js Worker has no targetOrigin parameter.

      const request = await requestPromise;
      worker.postMessage({
        type: 'bridge-response',
        invocationId: 'invocation-b',
        requestId: request.requestId,
        success: true,
        dateNowMs: Date.now(),
        valueJson: '{"value":1}',
      }); // eslint-disable-line unicorn/require-post-message-target-origin -- Node.js Worker has no targetOrigin parameter.

      const error = await errorPromise;
      expect(error.message).toBe(
        `Bridge response invocationId mismatch for request ${request.requestId}: expected invocation-a, received invocation-b.`,
      );
    } finally {
      await worker.terminate();
    }
  });

  it('rejects overlapping run messages in one worker', async () => {
    const worker = createWorker();
    try {
      const errorPromise = waitForWorkerError(worker);
      const requestPromise = waitForWorkerMessage(
        worker,
        (message): message is { type: 'tool-request' } =>
          message.type === 'tool-request',
      );

      worker.postMessage({
        type: 'run',
        invocationId: 'invocation-a',
        js: 'return await tools.echo({});',
        determinism: WORKER_DETERMINISM,
        options: WORKER_OPTIONS,
      }); // eslint-disable-line unicorn/require-post-message-target-origin -- Node.js Worker has no targetOrigin parameter.
      await requestPromise;

      worker.postMessage({
        type: 'run',
        invocationId: 'invocation-b',
        js: "return 'should not run';",
        determinism: WORKER_DETERMINISM,
        options: WORKER_OPTIONS,
      }); // eslint-disable-line unicorn/require-post-message-target-origin -- Node.js Worker has no targetOrigin parameter.

      const error = await errorPromise;
      expect(error.message).toBe(
        'Worker received run invocation-b while invocation-a is still active.',
      );
    } finally {
      await worker.terminate();
    }
  });
});

function createWorker() {
  return new Worker(
    new URL(
      `data:text/javascript;base64,${Buffer.from(INLINE_CODE_MODE_WORKER_SOURCE).toString('base64')}`,
    ),
  );
}

async function waitForWorkerError(worker: Worker): Promise<Error> {
  return await new Promise(resolve => {
    worker.once('error', resolve);
  });
}

async function waitForWorkerMessage<T>(
  worker: Worker,
  predicate: (message: any) => message is T,
): Promise<T> {
  return await new Promise(resolve => {
    const onMessage = (message: any) => {
      if (!predicate(message)) {
        return;
      }
      worker.off('message', onMessage);
      resolve(message);
    };
    worker.on('message', onMessage);
  });
}
