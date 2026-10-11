import { simulateReadableStream } from './simulate-readable-stream';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { beforeEach, describe, expect, it } from 'vitest';

describe('simulateReadableStream', () => {
  let delayValues: (number | null)[] = [];
  const mockDelay = (ms: number | null) => {
    delayValues.push(ms);
    return Promise.resolve();
  };

  beforeEach(() => {
    delayValues = [];
  });

  it('should create a readable stream with provided values', async () => {
    const values = ['a', 'b', 'c'];
    const stream = simulateReadableStream({ chunks: values });

    expect(await convertReadableStreamToArray(stream)).toEqual(values);
  });

  it('should respect the chunkDelayInMs setting', async () => {
    const stream = simulateReadableStream({
      chunks: [1, 2, 3],
      initialDelayInMs: 500,
      chunkDelayInMs: 100,
      _internal: { delay: mockDelay },
    });

    await convertReadableStreamToArray(stream); // consume stream

    expect(delayValues).toEqual([500, 100, 100]);
  });

  it('should handle empty values array', async () => {
    const stream = simulateReadableStream({ chunks: [] });
    const reader = stream.getReader();

    const { done, value } = await reader.read();

    expect(done).toBe(true);
    expect(value).toBeUndefined();
  });

  it('should handle different types of values', async () => {
    const stream = simulateReadableStream({
      chunks: [
        { id: 1, text: 'hello' },
        { id: 2, text: 'world' },
      ],
    });

    expect(await convertReadableStreamToArray(stream)).toEqual([
      { id: 1, text: 'hello' },
      { id: 2, text: 'world' },
    ]);
  });

  it('should skip all delays when both delay settings are null', async () => {
    const stream = simulateReadableStream({
      chunks: [1, 2, 3],
      initialDelayInMs: null,
      chunkDelayInMs: null,
      _internal: { delay: mockDelay },
    });

    await convertReadableStreamToArray(stream); // consume stream

    expect(delayValues).toEqual([null, null, null]);
  });

  it('should apply chunk delays but skip initial delay when initialDelayInMs is null', async () => {
    const stream = simulateReadableStream({
      chunks: [1, 2, 3],
      initialDelayInMs: null,
      chunkDelayInMs: 100,
      _internal: { delay: mockDelay },
    });

    await convertReadableStreamToArray(stream); // consume stream

    expect(delayValues).toEqual([null, 100, 100]);
  });

  it('should apply initial delay but skip chunk delays when chunkDelayInMs is null', async () => {
    const stream = simulateReadableStream({
      chunks: [1, 2, 3],
      initialDelayInMs: 500,
      chunkDelayInMs: null,
      _internal: { delay: mockDelay },
    });

    await convertReadableStreamToArray(stream); // consume stream

    expect(delayValues).toEqual([500, null, null]);
  });

  it('should abort a pending initial delay when cancelled', async () => {
    let abortSignal: AbortSignal | undefined;
    let notifyDelayStarted: () => void;
    const delayStarted = new Promise<void>(resolve => {
      notifyDelayStarted = resolve;
    });

    const stream = simulateReadableStream({
      chunks: ['value'],
      initialDelayInMs: 1000,
      _internal: {
        delay: (_ms, options) => {
          abortSignal = options?.abortSignal;
          notifyDelayStarted();

          return new Promise((_, reject) => {
            abortSignal?.addEventListener(
              'abort',
              () => reject(abortSignal?.reason),
              { once: true },
            );
          });
        },
      },
    });
    const reader = stream.getReader();
    const read = reader.read();

    await delayStarted;
    await reader.cancel();

    expect(abortSignal?.aborted).toBe(true);
    await expect(read).resolves.toEqual({ done: true, value: undefined });
  });

  it('should abort a pending chunk delay when cancelled', async () => {
    let abortSignal: AbortSignal | undefined;
    let notifyDelayStarted: () => void;
    const delayStarted = new Promise<void>(resolve => {
      notifyDelayStarted = resolve;
    });

    const stream = simulateReadableStream({
      chunks: ['first', 'second'],
      initialDelayInMs: null,
      chunkDelayInMs: 1000,
      _internal: {
        delay: (ms, options) => {
          if (ms == null) {
            return Promise.resolve();
          }

          abortSignal = options?.abortSignal;
          notifyDelayStarted();

          return new Promise((_, reject) => {
            abortSignal?.addEventListener(
              'abort',
              () => reject(abortSignal?.reason),
              { once: true },
            );
          });
        },
      },
    });
    const reader = stream.getReader();

    await expect(reader.read()).resolves.toEqual({
      done: false,
      value: 'first',
    });
    const read = reader.read();
    await delayStarted;
    await reader.cancel();

    expect(abortSignal?.aborted).toBe(true);
    await expect(read).resolves.toEqual({ done: true, value: undefined });
  });
});
