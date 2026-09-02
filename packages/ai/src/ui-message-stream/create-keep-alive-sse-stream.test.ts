import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InvalidArgumentError } from '../error/invalid-argument-error';
import { createKeepAliveSseStream } from './create-keep-alive-sse-stream';

const KEEP_ALIVE_COMMENT = ': keep-alive\n\n';

/**
 * A source stream that stays silent until the test explicitly pushes into it.
 * This is what an idle stream (e.g. a resumed stream at the live edge) looks
 * like on the server.
 */
function createGatedStream() {
  let controller!: ReadableStreamDefaultController<string>;
  const cancel = vi.fn();
  const read = vi.fn();

  const stream = new ReadableStream<string>({
    start(controllerArg) {
      controller = controllerArg;
    },
    cancel,
  });

  // count the reads that the keep-alive stream performs on the source:
  const getReader = stream.getReader.bind(stream);
  stream.getReader = (() => {
    const reader = getReader();
    const originalRead = reader.read.bind(reader);
    reader.read = () => {
      read();
      return originalRead();
    };
    return reader;
  }) as typeof stream.getReader;

  return {
    stream,
    push: (chunk: string) => controller.enqueue(chunk),
    close: () => controller.close(),
    error: (error: unknown) => controller.error(error),
    cancel,
    read,
  };
}

describe('createKeepAliveSseStream', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should enqueue a keep-alive comment before the source emits anything', async () => {
    const source = createGatedStream();

    const reader = createKeepAliveSseStream({
      stream: source.stream,
      keepAliveMs: 25_000,
    }).getReader();

    expect(await reader.read()).toEqual({
      done: false,
      value: KEEP_ALIVE_COMMENT,
    });
  });

  it('should enqueue a keep-alive comment for each idle interval', async () => {
    const source = createGatedStream();

    const reader = createKeepAliveSseStream({
      stream: source.stream,
      keepAliveMs: 25_000,
    }).getReader();

    await reader.read(); // initial keep-alive comment

    for (let i = 0; i < 3; i++) {
      const read = reader.read();
      await vi.advanceTimersByTimeAsync(25_000);
      expect(await read).toEqual({ done: false, value: KEEP_ALIVE_COMMENT });
    }
  });

  it('should forward chunks from the source', async () => {
    const source = createGatedStream();

    const reader = createKeepAliveSseStream({
      stream: source.stream,
      keepAliveMs: 25_000,
    }).getReader();

    await reader.read(); // initial keep-alive comment

    source.push('data: 1\n\n');
    source.push('data: 2\n\n');

    expect(await reader.read()).toEqual({ done: false, value: 'data: 1\n\n' });
    expect(await reader.read()).toEqual({ done: false, value: 'data: 2\n\n' });
  });

  it('should restart the idle interval after a source chunk', async () => {
    const source = createGatedStream();

    const reader = createKeepAliveSseStream({
      stream: source.stream,
      keepAliveMs: 25_000,
    }).getReader();

    await reader.read(); // initial keep-alive comment

    await vi.advanceTimersByTimeAsync(20_000);
    source.push('data: 1\n\n');
    expect(await reader.read()).toEqual({ done: false, value: 'data: 1\n\n' });

    // the remaining 5s of the previous interval must not trigger a keep-alive:
    const read = reader.read();
    let resolved = false;
    read.then(() => {
      resolved = true;
    });

    await vi.advanceTimersByTimeAsync(24_999);
    expect(resolved).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(await read).toEqual({ done: false, value: KEEP_ALIVE_COMMENT });
  });

  it('should close when the source closes', async () => {
    const source = createGatedStream();

    const reader = createKeepAliveSseStream({
      stream: source.stream,
      keepAliveMs: 25_000,
    }).getReader();

    await reader.read(); // initial keep-alive comment

    source.close();

    expect(await reader.read()).toEqual({ done: true, value: undefined });
  });

  it('should propagate source errors to the consumer', async () => {
    const source = createGatedStream();

    const reader = createKeepAliveSseStream({
      stream: source.stream,
      keepAliveMs: 25_000,
    }).getReader();

    await reader.read(); // initial keep-alive comment

    const read = reader.read();
    source.error(new Error('source failed'));

    await expect(read).rejects.toThrow('source failed');
  });

  it('should cancel the source when the consumer cancels while a read is pending', async () => {
    const source = createGatedStream();

    const reader = createKeepAliveSseStream({
      stream: source.stream,
      keepAliveMs: 25_000,
    }).getReader();

    await reader.read(); // initial keep-alive comment

    reader.read(); // pending read on the idle source
    await vi.advanceTimersByTimeAsync(0);

    await reader.cancel('client disconnected');

    expect(source.cancel).toHaveBeenCalledWith('client disconnected');
  });

  it('should not queue additional source reads while the source is idle', async () => {
    const source = createGatedStream();

    const reader = createKeepAliveSseStream({
      stream: source.stream,
      keepAliveMs: 25_000,
    }).getReader();

    await reader.read(); // initial keep-alive comment

    for (let i = 0; i < 5; i++) {
      const read = reader.read();
      await vi.advanceTimersByTimeAsync(25_000);
      await read;
    }

    // a single outstanding read is reused across all keep-alive intervals:
    expect(source.read).toHaveBeenCalledTimes(1);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'should throw an InvalidArgumentError for keepAliveMs %s',
    keepAliveMs => {
      expect(() =>
        createKeepAliveSseStream({
          stream: createGatedStream().stream,
          keepAliveMs,
        }),
      ).toThrow(InvalidArgumentError);
    },
  );

  it('should not leave keep-alive timers behind after the source closes', async () => {
    const source = createGatedStream();

    const reader = createKeepAliveSseStream({
      stream: source.stream,
      keepAliveMs: 25_000,
    }).getReader();

    await reader.read(); // initial keep-alive comment

    source.close();
    await reader.read();

    expect(vi.getTimerCount()).toBe(0);
  });
});
