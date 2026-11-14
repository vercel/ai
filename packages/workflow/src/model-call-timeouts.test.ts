import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createModelCallTimeouts,
  readUntilAborted,
} from './model-call-timeouts.js';

function expectTimeoutReason(reason: unknown, message: string) {
  expect((reason as Error)?.name).toBe('TimeoutError');
  expect((reason as Error)?.message).toBe(message);
}

function sleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms));
}

describe('createModelCallTimeouts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the passed signal unchanged when no timeout is set', () => {
    const controller = new AbortController();
    const timeouts = createModelCallTimeouts({
      abortSignal: controller.signal,
    });

    expect(timeouts.abortSignal).toBe(controller.signal);
  });

  it('returns no signal when neither a signal nor a timeout is set', () => {
    const timeouts = createModelCallTimeouts({ abortSignal: undefined });

    expect(timeouts.abortSignal).toBeUndefined();
  });

  it('aborts the returned signal with a step timeout error', async () => {
    const timeouts = createModelCallTimeouts({
      abortSignal: undefined,
      stepTimeoutMs: 250,
    });
    timeouts.startStepTimeout();

    await vi.advanceTimersByTimeAsync(249);
    expect(timeouts.abortSignal?.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(timeouts.abortSignal?.aborted).toBe(true);
    expectTimeoutReason(
      timeouts.abortSignal?.reason,
      'Step timeout of 250ms exceeded',
    );
  });

  it('fires the first-chunk timeout when no output chunk arrives', async () => {
    const timeouts = createModelCallTimeouts({
      abortSignal: undefined,
      firstChunkTimeoutMs: 100,
    });
    timeouts.startFirstChunkTimeout();

    await vi.advanceTimersByTimeAsync(100);
    expect(timeouts.abortSignal?.aborted).toBe(true);
    expectTimeoutReason(
      timeouts.abortSignal?.reason,
      'First chunk timeout of 100ms exceeded',
    );
  });

  it('cancels the first-chunk timeout on the first output chunk', async () => {
    const timeouts = createModelCallTimeouts({
      abortSignal: undefined,
      firstChunkTimeoutMs: 100,
      chunkTimeoutMs: 500,
    });
    timeouts.startFirstChunkTimeout();

    await vi.advanceTimersByTimeAsync(50);
    timeouts.onOutputChunk();

    await vi.advanceTimersByTimeAsync(200);
    expect(timeouts.abortSignal?.aborted).toBe(false);
  });

  it('starts the chunk timer on the first output chunk and again on each further chunk', async () => {
    const timeouts = createModelCallTimeouts({
      abortSignal: undefined,
      chunkTimeoutMs: 100,
    });

    expect(vi.getTimerCount()).toBe(0);
    timeouts.onOutputChunk();
    expect(vi.getTimerCount()).toBe(1);

    await vi.advanceTimersByTimeAsync(80);
    timeouts.onOutputChunk();

    await vi.advanceTimersByTimeAsync(80);
    expect(timeouts.abortSignal?.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(20);
    expect(timeouts.abortSignal?.aborted).toBe(true);
    expectTimeoutReason(
      timeouts.abortSignal?.reason,
      'Chunk timeout of 100ms exceeded',
    );
  });

  it('clears the output timeouts and keeps the step timer', async () => {
    const timeouts = createModelCallTimeouts({
      abortSignal: undefined,
      stepTimeoutMs: 500,
      firstChunkTimeoutMs: 100,
      chunkTimeoutMs: 100,
    });
    timeouts.startStepTimeout();
    timeouts.startFirstChunkTimeout();
    timeouts.onOutputChunk();

    timeouts.clearOutputTimeouts();
    expect(vi.getTimerCount()).toBe(1);

    await vi.advanceTimersByTimeAsync(200);
    expect(timeouts.abortSignal?.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(300);
    expect(timeouts.abortSignal?.aborted).toBe(true);
    expectTimeoutReason(
      timeouts.abortSignal?.reason,
      'Step timeout of 500ms exceeded',
    );
  });

  it('leaves no timer after clear()', async () => {
    const timeouts = createModelCallTimeouts({
      abortSignal: undefined,
      stepTimeoutMs: 500,
      firstChunkTimeoutMs: 100,
      chunkTimeoutMs: 100,
    });
    timeouts.startStepTimeout();
    timeouts.startFirstChunkTimeout();
    timeouts.onOutputChunk();
    // The step and chunk timers run; the first chunk timer is done.
    expect(vi.getTimerCount()).toBe(2);

    timeouts.clear();
    expect(vi.getTimerCount()).toBe(0);

    await vi.advanceTimersByTimeAsync(1000);
    expect(timeouts.abortSignal?.aborted).toBe(false);
  });

  it('starts no timer when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const timeouts = createModelCallTimeouts({
      abortSignal: controller.signal,
      stepTimeoutMs: 100,
      firstChunkTimeoutMs: 100,
      chunkTimeoutMs: 100,
    });

    timeouts.startStepTimeout();
    timeouts.startFirstChunkTimeout();
    timeouts.onOutputChunk();

    expect(vi.getTimerCount()).toBe(0);
    expect(timeouts.abortSignal?.aborted).toBe(true);
  });

  it('aborts the returned signal with the reason of the passed signal', () => {
    const controller = new AbortController();
    const timeouts = createModelCallTimeouts({
      abortSignal: controller.signal,
      stepTimeoutMs: 100,
    });
    const reason = new Error('external abort');

    controller.abort(reason);

    expect(timeouts.abortSignal?.aborted).toBe(true);
    expect(timeouts.abortSignal?.reason).toBe(reason);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('readUntilAborted', () => {
  it('yields all parts of a finite stream in order', async () => {
    const stream = new ReadableStream<number>({
      start(controller) {
        controller.enqueue(1);
        controller.enqueue(2);
        controller.enqueue(3);
        controller.close();
      },
    });

    const values: number[] = [];
    for await (const value of readUntilAborted(stream, undefined)) {
      values.push(value);
    }

    expect(values).toEqual([1, 2, 3]);
  });

  it('ends when the signal aborts while a read is pending', async () => {
    const stream = new ReadableStream<string>({
      start(controller) {
        controller.enqueue('first');
      },
    });
    const controller = new AbortController();
    const values: string[] = [];
    const startedAt = Date.now();

    const consume = (async () => {
      for await (const value of readUntilAborted(stream, controller.signal)) {
        values.push(value);
      }
    })();

    await sleep(20);
    controller.abort(new DOMException('Chunk timeout', 'TimeoutError'));
    await consume;

    expect(values).toEqual(['first']);
    expect(Date.now() - startedAt).toBeLessThan(1500);
  });

  it('ends at once for an already aborted signal', async () => {
    const stream = new ReadableStream<string>({
      start(controller) {
        controller.enqueue('first');
      },
    });
    const controller = new AbortController();
    controller.abort();

    const values: string[] = [];
    for await (const value of readUntilAborted(stream, controller.signal)) {
      values.push(value);
    }

    expect(values).toEqual([]);
  });

  it('cancels the source stream when the consumer stops early', async () => {
    const cancelled: unknown[] = [];
    const stream = new ReadableStream<number>({
      start(controller) {
        controller.enqueue(1);
      },
      cancel(reason) {
        cancelled.push(reason);
      },
    });

    for await (const value of readUntilAborted(stream, undefined)) {
      expect(value).toBe(1);
      break;
    }

    expect(cancelled).toHaveLength(1);
  });

  it('rethrows an error of the stream', async () => {
    const error = new Error('provider stream failed');
    const stream = new ReadableStream<number>({
      start(controller) {
        controller.error(error);
      },
    });

    const consume = async () => {
      for await (const _value of readUntilAborted(stream, undefined)) {
        // The stream errors before it yields a part.
      }
    };

    await expect(consume()).rejects.toBe(error);
  });
});
