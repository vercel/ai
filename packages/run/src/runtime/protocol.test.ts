import { Buffer } from 'node:buffer';
import { Worker } from 'node:worker_threads';
import { describe, expect, it } from 'vitest';
import { INLINE_RUN_WORKER_SOURCE } from '../../dist/runtime/worker-source.js';
import {
  assertMainToWorkerMessage,
  assertWorkerToMainMessage,
} from '../../dist/runtime/protocol-validation.js';

const WORKER_OPTIONS = {
  timeoutMs: 1_000,
  executionTimeoutMs: 950,
  memoryLimitBytes: 64 * 1024 * 1024,
  maxStackSizeBytes: 2 * 1024 * 1024,
  maxResultBytes: 1024 * 1024,
  maxConsoleOutputBytes: 64 * 1024,
  maxBindingInputBytes: 1024 * 1024,
};

const DETERMINISM = {
  dateNowMs: 1_700_000_000_000,
  randomSeed: '00000000000000000000000000000001',
};

describe('worker protocol hardening', () => {
  it.each([
    null,
    {},
    { type: 'unknown' },
    { ...createRunMessage('invocation-a'), extra: true },
    { ...createRunMessage('invocation-a'), invocationId: '' },
    { type: 'cancel', invocationId: '', extra: true },
    { type: 'cancel', invocationId: '' },
    {
      ...createRunMessage('invocation-a'),
      bindingNamespaces: ['tools', 'tools'],
    },
    {
      ...createRunMessage('invocation-a'),
      options: { ...WORKER_OPTIONS, timeoutMs: 0 },
    },
    {
      type: 'bridge-response',
      invocationId: 'invocation-a',
      requestId: 'request-a',
      success: true,
      valueJson: '',
    },
  ])('rejects malformed main-to-worker messages %#', value => {
    expect(() => assertMainToWorkerMessage(value)).toThrowError(
      expect.objectContaining({ code: 'RUN_PROTOCOL_ERROR' }),
    );
  });

  it.each([
    null,
    {},
    { type: 'unknown' },
    { type: 'ready', invocationId: 'run-1', extra: true },
    { type: 'bridge-idle', invocationId: 'run-1', requestCount: -1 },
    {
      type: 'binding-request',
      invocationId: 'run-1',
      requestId: 'request-1',
      bindingName: '',
      inputJson: '[]',
    },
    { type: 'result', invocationId: 'run-1', success: true },
    {
      type: 'result',
      invocationId: 'run-1',
      success: false,
      error: { name: 'Error', message: 'failure', unexpected: true },
    },
  ])('rejects malformed worker-to-main messages %#', value => {
    expect(() => assertWorkerToMainMessage(value)).toThrowError(
      expect.objectContaining({ code: 'RUN_PROTOCOL_ERROR' }),
    );
  });

  it('fails closed for 10,000 generated malformed protocol values', () => {
    let randomState = 0x12345678;
    const validators: Array<(value: unknown) => void> = [
      value => assertMainToWorkerMessage(value),
      value => assertWorkerToMainMessage(value),
    ];
    for (let index = 0; index < 10_000; index++) {
      const value = generatedValue(0);
      for (const validate of validators) {
        try {
          validate(value);
        } catch (error) {
          expect(error).toMatchObject({ code: 'RUN_PROTOCOL_ERROR' });
        }
      }
    }

    function generatedValue(depth: number): unknown {
      const choice = next() % (depth > 2 ? 5 : 8);
      if (choice === 0) return null;
      if (choice === 1) return next();
      if (choice === 2) return `value-${next()}`;
      if (choice === 3) return Boolean(next() & 1);
      if (choice === 4) return undefined;
      if (choice === 5)
        return Array.from({ length: next() % 4 }, () =>
          generatedValue(depth + 1),
        );
      const result: Record<string, unknown> = {};
      for (let item = 0; item < next() % 5; item++) {
        result[`key-${next() % 12}`] = generatedValue(depth + 1);
      }
      return result;
    }

    function next(): number {
      randomState ^= randomState << 13;
      randomState ^= randomState >>> 17;
      randomState ^= randomState << 5;
      return randomState >>> 0;
    }
  });

  it('rejects every generated mutation of known-valid messages', () => {
    let randomState = 0x51f15e5d;
    const validMessages = [
      { direction: 'main', value: createRunMessage('run-a') },
      { direction: 'main', value: { type: 'cancel', invocationId: 'run-a' } },
      {
        direction: 'main',
        value: {
          type: 'bridge-response',
          invocationId: 'run-a',
          requestId: 'request-a',
          success: true,
          dateNowMs: DETERMINISM.dateNowMs,
          valueJson: 'null',
        },
      },
      { direction: 'worker', value: { type: 'ready', invocationId: 'run-a' } },
      {
        direction: 'worker',
        value: {
          type: 'binding-request',
          invocationId: 'run-a',
          requestId: 'request-a',
          bindingName: 'tools.echo',
          inputJson: 'null',
        },
      },
      {
        direction: 'worker',
        value: {
          type: 'result',
          invocationId: 'run-a',
          success: true,
          valueJson: 'null',
        },
      },
    ] as const;

    for (let iteration = 0; iteration < 10_000; iteration++) {
      const candidate = validMessages[next() % validMessages.length]!;
      const mutation = structuredClone(candidate.value) as Record<
        string,
        unknown
      >;
      if (next() % 2 === 0) {
        const keys = Object.keys(mutation);
        delete mutation[keys[next() % keys.length]!];
      } else {
        mutation[`unexpected-${next()}`] = true;
      }
      const validate =
        candidate.direction === 'main'
          ? assertMainToWorkerMessage
          : assertWorkerToMainMessage;
      expect(
        () => validate(mutation),
        `seed iteration ${iteration}`,
      ).toThrowError(expect.objectContaining({ code: 'RUN_PROTOCOL_ERROR' }));
    }

    function next(): number {
      randomState ^= randomState << 13;
      randomState ^= randomState >>> 17;
      randomState ^= randomState << 5;
      return randomState >>> 0;
    }
  });

  it('causes the real worker to fail on an unknown message type', async () => {
    const worker = createWorker();
    try {
      const errorPromise = waitForWorkerError(worker);
      worker.postMessage({ type: 'unknown' }); // eslint-disable-line unicorn/require-post-message-target-origin -- Node.js Worker has no targetOrigin parameter.
      await expect(errorPromise).resolves.toMatchObject({
        message: 'Invalid main-to-worker worker protocol message.',
      });
    } finally {
      await worker.terminate();
    }
  });

  it('rejects bridge responses with unknown request IDs', async () => {
    const worker = createWorker();
    try {
      const errorPromise = waitForWorkerError(worker);
      worker.postMessage({
        type: 'bridge-response',
        invocationId: 'invocation-a',
        requestId: 'missing-request',
        success: true,
        dateNowMs: DETERMINISM.dateNowMs,
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
        (message): message is { type: 'binding-request'; requestId: string } =>
          isRecord(message) &&
          message.type === 'binding-request' &&
          typeof message.requestId === 'string',
      );

      worker.postMessage(createRunMessage('invocation-a')); // eslint-disable-line unicorn/require-post-message-target-origin -- Node.js Worker has no targetOrigin parameter.
      const request = await requestPromise;
      worker.postMessage({
        type: 'bridge-response',
        invocationId: 'invocation-b',
        requestId: request.requestId,
        success: true,
        dateNowMs: DETERMINISM.dateNowMs,
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
        (message): message is { type: 'binding-request' } =>
          isRecord(message) && message.type === 'binding-request',
      );

      worker.postMessage(createRunMessage('invocation-a')); // eslint-disable-line unicorn/require-post-message-target-origin -- Node.js Worker has no targetOrigin parameter.
      await requestPromise;
      worker.postMessage({
        ...createRunMessage('invocation-b'),
        source: "return 'should not run';",
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

function createRunMessage(invocationId: string) {
  return {
    type: 'run',
    invocationId,
    source: 'return await tools.echo({ value: 1 });',
    bindingNamespaces: ['tools'],
    determinism: DETERMINISM,
    options: WORKER_OPTIONS,
  };
}

function createWorker() {
  return new Worker(
    new URL(
      `data:text/javascript;base64,${Buffer.from(INLINE_RUN_WORKER_SOURCE).toString('base64')}`,
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
  predicate: (message: unknown) => message is T,
): Promise<T> {
  return await new Promise(resolve => {
    const onMessage = (message: unknown) => {
      if (!predicate(message)) {
        return;
      }
      worker.off('message', onMessage);
      resolve(message);
    };
    worker.on('message', onMessage);
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
