import { EventEmitter } from 'node:events';
import type { Worker } from 'node:worker_threads';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { run } from '../run.js';
import { setRuntimeWorkerFactoryForTest } from './manager.js';

describe('manager protocol state machine', () => {
  afterEach(() => setRuntimeWorkerFactoryForTest(undefined));

  it.each([
    {
      name: 'ready before result',
      messages: (invocationId: string) => [{ type: 'ready', invocationId }],
      message: /ready without a result/u,
    },
    {
      name: 'duplicate result',
      messages: (invocationId: string) => [
        { type: 'result', invocationId, success: true, valueJson: '[1]' },
        { type: 'result', invocationId, success: true, valueJson: '[2]' },
      ],
      message: /duplicate result/u,
    },
    {
      name: 'wrong invocation',
      messages: () => [
        {
          type: 'result',
          invocationId: 'stale-run',
          success: true,
          valueJson: '[1]',
        },
      ],
      message: /invocationId mismatch/u,
    },
    {
      name: 'wrong idle count',
      messages: (invocationId: string) => [
        { type: 'bridge-idle', invocationId, requestCount: 1 },
      ],
      message: /bridge-idle count mismatch/u,
    },
  ])('rejects $name', async ({ messages, message }) => {
    setRuntimeWorkerFactoryForTest(
      () => new FakeWorker(messages) as unknown as Worker,
    );
    await expect(run({ source: 'return 1;' })).rejects.toMatchObject({
      code: 'RUN_PROTOCOL_ERROR',
      message: expect.stringMatching(message),
    });
    await expectCleanRun();
  });

  it('rejects binding traffic after a terminal result without dispatch', async () => {
    const binding = vi.fn(() => 'effect');
    setRuntimeWorkerFactoryForTest(
      () =>
        new FakeWorker(invocationId => [
          { type: 'result', invocationId, success: true, valueJson: '[1]' },
          {
            type: 'binding-request',
            invocationId,
            requestId: `${invocationId}:bridge-1`,
            bindingName: 'tools.effect',
            inputJson: '[[]]',
          },
        ]) as unknown as Worker,
    );
    await expect(
      run({ source: 'return 1;', bindings: { tools: { effect: binding } } }),
    ).rejects.toMatchObject({ code: 'RUN_PROTOCOL_ERROR' });
    expect(binding).not.toHaveBeenCalled();
    await expectCleanRun();
  });

  it.each([
    {
      name: 'worker error',
      event: 'error' as const,
      argument: new Error('injected worker failure'),
      message: 'injected worker failure',
    },
    {
      name: 'worker exit',
      event: 'exit' as const,
      argument: 17,
      message:
        'JavaScript runtime worker exited before completion with code 17.',
    },
  ])(
    'settles once and recovers after $name',
    async ({ event, argument, message }) => {
      setRuntimeWorkerFactoryForTest(
        () => new TerminalWorker(event, argument) as unknown as Worker,
      );
      await expect(run({ source: 'return 1;' })).rejects.toThrow(message);
      await expectCleanRun();
    },
  );
});

async function expectCleanRun(): Promise<void> {
  setRuntimeWorkerFactoryForTest(
    () =>
      new FakeWorker(invocationId => [
        { type: 'result', invocationId, success: true, valueJson: '[1]' },
        { type: 'ready', invocationId },
      ]) as unknown as Worker,
  );
  await expect(run({ source: 'return 1;' })).resolves.toEqual({
    status: 'completed',
    value: 1,
  });
}

class FakeWorker extends EventEmitter {
  readonly #messages: (invocationId: string) => Array<Record<string, unknown>>;

  constructor(
    messages: (invocationId: string) => Array<Record<string, unknown>>,
  ) {
    super();
    this.#messages = messages;
  }

  postMessage(value: unknown): void {
    const message = value as { type?: string; invocationId?: string };
    if (message.type !== 'run' || message.invocationId === undefined) return;
    queueMicrotask(() => {
      for (const response of this.#messages(message.invocationId!)) {
        this.emit('message', response);
      }
    });
  }

  ref(): this {
    return this;
  }

  unref(): this {
    return this;
  }

  async terminate(): Promise<number> {
    this.emit('exit', 0);
    return 0;
  }
}

class TerminalWorker extends EventEmitter {
  constructor(
    private readonly event: 'error' | 'exit',
    private readonly argument: Error | number,
  ) {
    super();
  }

  postMessage(): void {
    queueMicrotask(() => this.emit(this.event, this.argument));
  }

  ref(): this {
    return this;
  }

  unref(): this {
    return this;
  }

  async terminate(): Promise<number> {
    return 0;
  }
}
