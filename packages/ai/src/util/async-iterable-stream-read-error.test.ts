import { describe, expect, it } from 'vitest';
import {
  asAsyncIterableStream,
  createAsyncIterableStream,
  type AsyncIterableStream,
} from './async-iterable-stream';

type StreamFactory = <T>(stream: ReadableStream<T>) => AsyncIterableStream<T>;

const implementations: Array<{
  name: string;
  create: StreamFactory;
}> = [
  {
    name: 'createAsyncIterableStream',
    create: createAsyncIterableStream,
  },
  {
    name: 'asAsyncIterableStream',
    create: asAsyncIterableStream,
  },
];

describe.each(implementations)('$name read-error cleanup', ({ create }) => {
  it('releases the reader and preserves the exact source error', async () => {
    const sourceError = { type: 'source-error' };
    let controller!: ReadableStreamDefaultController<string>;
    let cancelCalls = 0;

    const source = new ReadableStream<string>({
      start(controllerParam) {
        controller = controllerParam;
        controller.enqueue('chunk1');
      },
      cancel() {
        cancelCalls++;
      },
    });

    const stream = create(source);
    const iterator = stream[Symbol.asyncIterator]();

    expect(await iterator.next()).toEqual({
      done: false,
      value: 'chunk1',
    });

    const failedRead = iterator.next();
    controller.error(sourceError);

    await expect(failedRead).rejects.toBe(sourceError);
    expect(stream.locked).toBe(false);
    expect(cancelCalls).toBe(0);

    expect(await iterator.next()).toEqual({
      done: true,
      value: undefined,
    });
    expect(await iterator.return?.()).toEqual({
      done: true,
      value: undefined,
    });

    const reader = stream.getReader();
    await expect(reader.read()).rejects.toBe(sourceError);
    reader.releaseLock();
  });

  it('releases the reader when the source error reason is undefined', async () => {
    let controller!: ReadableStreamDefaultController<string>;

    const stream = create(
      new ReadableStream<string>({
        start(controllerParam) {
          controller = controllerParam;
        },
      }),
    );
    const iterator = stream[Symbol.asyncIterator]();
    const failedRead = iterator.next();

    controller.error(undefined);

    await expect(failedRead).rejects.toBeUndefined();
    expect(stream.locked).toBe(false);
    expect(await iterator.next()).toEqual({
      done: true,
      value: undefined,
    });
  });

  it('settles concurrent pending reads with the original error and cleans up once', async () => {
    const sourceError = new Error('source failed');
    let controller!: ReadableStreamDefaultController<string>;
    let cancelCalls = 0;

    const source = new ReadableStream<string>({
      start(controllerParam) {
        controller = controllerParam;
      },
      cancel() {
        cancelCalls++;
      },
    });

    const stream = create(source);
    const iterator = stream[Symbol.asyncIterator]();
    const firstRead = iterator.next();
    const secondRead = iterator.next();

    controller.error(sourceError);

    const outcomes = await Promise.allSettled([firstRead, secondRead]);
    expect(outcomes).toEqual([
      { status: 'rejected', reason: sourceError },
      { status: 'rejected', reason: sourceError },
    ]);
    expect(stream.locked).toBe(false);
    expect(cancelCalls).toBe(0);
    expect(await iterator.next()).toEqual({
      done: true,
      value: undefined,
    });
  });
});
