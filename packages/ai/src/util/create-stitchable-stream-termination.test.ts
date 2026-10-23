import {
  convertArrayToReadableStream,
  convertReadableStreamToArray,
} from '@ai-sdk/provider-utils/test';
import { describe, expect, it } from 'vitest';
import { createStitchableStream } from './create-stitchable-stream';

describe('stitchable stream termination', () => {
  it('can terminate repeatedly without cancelling an inner stream twice', async () => {
    const { stream, addStream, terminate } = createStitchableStream<number>();
    let cancelCount = 0;
    addStream(
      new ReadableStream({
        cancel() {
          cancelCount++;
        },
      }),
    );

    terminate();
    expect(() => terminate()).not.toThrow();
    expect(cancelCount).toBe(1);
    expect(await convertReadableStreamToArray(stream)).toEqual([]);
  });

  it('can terminate after graceful completion', async () => {
    const { stream, addStream, close, terminate } =
      createStitchableStream<number>();
    addStream(convertArrayToReadableStream([1, 2]));
    close();

    expect(await convertReadableStreamToArray(stream)).toEqual([1, 2]);
    expect(() => terminate()).not.toThrow();
    expect(() => close()).not.toThrow();
  });

  it('does not report a pending read as an error after termination', async () => {
    const { stream, addStream, terminate } = createStitchableStream<number>();
    const errors: unknown[] = [];
    let notifyRead!: () => void;
    const readStarted = new Promise<void>(resolve => {
      notifyRead = resolve;
    });
    addStream(
      new ReadableStream<number>(
        {
          pull() {
            notifyRead();
          },
        },
        { highWaterMark: 0 },
      ),
      { onError: error => errors.push(error) },
    );
    const reader = stream.getReader();
    const pendingRead = reader.read();
    await readStarted;

    terminate();

    expect(await pendingRead).toEqual({ value: undefined, done: true });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(errors).toEqual([]);
    reader.releaseLock();
  });

  it('can force termination while graceful closure is still draining', async () => {
    const { stream, addStream, close, terminate } =
      createStitchableStream<number>();
    let cancelled = false;
    addStream(
      new ReadableStream<number>({
        start(controller) {
          controller.enqueue(1);
        },
        cancel() {
          cancelled = true;
        },
      }),
    );
    close();
    const reader = stream.getReader();
    expect(await reader.read()).toEqual({ value: 1, done: false });

    terminate();

    expect(await reader.read()).toEqual({ value: undefined, done: true });
    expect(cancelled).toBe(true);
    reader.releaseLock();
  });

  it('handles a rejected inner cancellation without interrupting cleanup', async () => {
    const { stream, addStream, terminate } = createStitchableStream<number>();
    const cancellations: number[] = [];
    addStream(
      new ReadableStream<number>({
        cancel() {
          cancellations.push(1);
          return Promise.reject(new Error('inner cancellation failed'));
        },
      }),
    );
    addStream(
      new ReadableStream<number>({
        cancel() {
          cancellations.push(2);
        },
      }),
    );

    terminate();

    expect(cancellations).toEqual([1, 2]);
    expect(await convertReadableStreamToArray(stream)).toEqual([]);
    await new Promise(resolve => setTimeout(resolve, 0));
  });
});
