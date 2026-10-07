import {
  convertArrayToReadableStream,
  convertReadableStreamToArray,
} from '@ai-sdk/provider-utils/test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSseStreamWithKeepAlive } from './create-sse-stream-with-keep-alive';

describe('createSseStreamWithKeepAlive', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should pass through the original stream when keepAliveMs is undefined', () => {
    const stream = convertArrayToReadableStream(['data']);

    expect(
      createSseStreamWithKeepAlive({
        stream,
        keepAliveMs: undefined,
      }),
    ).toBe(stream);
  });

  it('should send an opening comment immediately and comments while the source is idle', async () => {
    const stream = new ReadableStream<string>();
    const reader = createSseStreamWithKeepAlive({
      stream,
      keepAliveMs: 100,
    }).getReader();

    await expect(reader.read()).resolves.toEqual({
      done: false,
      value: ': stream-open\n\n',
    });

    const keepAlive = reader.read();
    await vi.advanceTimersByTimeAsync(100);

    await expect(keepAlive).resolves.toEqual({
      done: false,
      value: ': keep-alive\n\n',
    });

    await reader.cancel();
  });

  it('should retain one pending source read across many idle keep-alives', async () => {
    const pendingSourceRead = new Promise<ReadableStreamReadResult<string>>(
      () => {},
    );
    const then = vi.spyOn(pendingSourceRead, 'then');
    const cancel = vi.fn();
    const stream = {
      getReader: () => ({
        read: () => pendingSourceRead,
        cancel,
      }),
    } as unknown as ReadableStream<string>;
    const reader = createSseStreamWithKeepAlive({
      stream,
      keepAliveMs: 100,
    }).getReader();

    await expect(reader.read()).resolves.toEqual({
      done: false,
      value: ': stream-open\n\n',
    });

    const keepAlives = Array.from({ length: 2_500 }, () => reader.read());
    await vi.advanceTimersByTimeAsync(250_000);

    await expect(Promise.all(keepAlives)).resolves.toEqual(
      Array.from({ length: 2_500 }, () => ({
        done: false,
        value: ': keep-alive\n\n',
      })),
    );
    expect(then).toHaveBeenCalledTimes(1);

    await reader.cancel();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('should reset the keep-alive timer after source activity', async () => {
    let sourceController: ReadableStreamDefaultController<string>;
    const stream = new ReadableStream<string>({
      start(controller) {
        sourceController = controller;
      },
    });
    const reader = createSseStreamWithKeepAlive({
      stream,
      keepAliveMs: 100,
    }).getReader();

    await reader.read();
    const sourceRead = reader.read();
    await vi.advanceTimersByTimeAsync(50);
    sourceController!.enqueue('data');

    await expect(sourceRead).resolves.toEqual({
      done: false,
      value: 'data',
    });

    const keepAlive = reader.read();
    await vi.advanceTimersByTimeAsync(99);
    expect(await Promise.race([keepAlive, Promise.resolve('pending')])).toBe(
      'pending',
    );

    await vi.advanceTimersByTimeAsync(1);
    await expect(keepAlive).resolves.toEqual({
      done: false,
      value: ': keep-alive\n\n',
    });

    await reader.cancel();
  });

  it('should preserve source chunks and completion', async () => {
    const stream = createSseStreamWithKeepAlive({
      stream: convertArrayToReadableStream(['data 1', 'data 2']),
      keepAliveMs: 100,
    });

    await expect(convertReadableStreamToArray(stream)).resolves.toEqual([
      ': stream-open\n\n',
      'data 1',
      'data 2',
    ]);
  });

  it('should cancel the source stream', async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<string>({ cancel });
    const reader = createSseStreamWithKeepAlive({
      stream,
      keepAliveMs: 100,
    }).getReader();

    await reader.read();
    await reader.cancel('cancel reason');

    expect(cancel).toHaveBeenCalledWith('cancel reason');
  });
});
