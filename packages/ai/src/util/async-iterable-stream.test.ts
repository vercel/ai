import {
  convertArrayToReadableStream,
  convertAsyncIterableToArray,
  convertReadableStreamToArray,
} from '@ai-sdk/provider-utils/test';
import { createAsyncIterableStream } from './async-iterable-stream';

describe('createAsyncIterableStream()', () => {
  it('should read all chunks from a non-empty stream using async iteration', async () => {
    const source = convertArrayToReadableStream(['chunk1', 'chunk2', 'chunk3']);

    const asyncIterableStream = createAsyncIterableStream(source);

    expect(await convertAsyncIterableToArray(asyncIterableStream)).toEqual([
      'chunk1',
      'chunk2',
      'chunk3',
    ]);
  });

  it('should handle an empty stream gracefully', async () => {
    const source = convertArrayToReadableStream<string>([]);
    const asyncIterableStream = createAsyncIterableStream(source);

    expect(await convertAsyncIterableToArray(asyncIterableStream)).toEqual([]);
  });

  it('should maintain ReadableStream functionality', async () => {
    const source = convertArrayToReadableStream(['chunk1', 'chunk2', 'chunk3']);

    const asyncIterableStream = createAsyncIterableStream(source);

    expect(await convertReadableStreamToArray(asyncIterableStream)).toEqual([
      'chunk1',
      'chunk2',
      'chunk3',
    ]);
  });

  it('should cancel stream on early exit from for-await loop', async () => {
    let streamCancelled = false;

    const source = new ReadableStream({
      start(controller) {
        controller.enqueue('chunk1');
        controller.enqueue('chunk2');
        controller.enqueue('chunk3');
      },
      cancel() {
        streamCancelled = true;
      },
    });

    const asyncIterableStream = createAsyncIterableStream(source);

    const collected: string[] = [];
    for await (const chunk of asyncIterableStream) {
      collected.push(chunk);
      if (chunk === 'chunk2') {
        break;
      }
    }

    expect(collected).toEqual(['chunk1', 'chunk2']);
    expect(streamCancelled).toBe(true);
  });

  it('should cancel stream when exception thrown inside for-await loop', async () => {
    let streamCancelled = false;

    const source = new ReadableStream({
      start(controller) {
        controller.enqueue('chunk1');
        controller.enqueue('chunk2');
        controller.enqueue('chunk3');
      },
      cancel() {
        streamCancelled = true;
      },
    });

    const asyncIterableStream = createAsyncIterableStream(source);

    const collected: string[] = [];
    await expect(async () => {
      for await (const chunk of asyncIterableStream) {
        collected.push(chunk);
        if (chunk === 'chunk2') {
          throw new Error('Test error');
        }
      }
    }).rejects.toThrow('Test error');

    expect(collected).toEqual(['chunk1', 'chunk2']);
    expect(streamCancelled).toBe(true);
  });

  it('should not cancel stream when exception thrown inside for-await loop', async () => {
    let streamCancelled = false;

    const source = new ReadableStream({
      start(controller) {
        controller.enqueue('chunk1');
        controller.enqueue('chunk2');
        controller.enqueue('chunk3');
        controller.close();
      },
      cancel() {
        streamCancelled = true;
      },
    });

    const asyncIterableStream = createAsyncIterableStream(source);

    expect(await convertAsyncIterableToArray(asyncIterableStream)).toEqual([
      'chunk1',
      'chunk2',
      'chunk3',
    ]);

    expect(streamCancelled).toBe(false);
  });

  it('should not allow iterating twice after breaking', async () => {
    const source = convertArrayToReadableStream(['chunk1', 'chunk2', 'chunk3']);

    const asyncIterableStream = createAsyncIterableStream(source);

    const collected: string[] = [];
    for await (const chunk of asyncIterableStream) {
      collected.push(chunk);
      if (chunk === 'chunk1') {
        break;
      }
    }

    expect(collected).toEqual(['chunk1']);

    for await (const chunk of asyncIterableStream) {
      collected.push(chunk);
    }

    expect(collected).toEqual(['chunk1']);
  });

  it('should propagate errors from source stream to async iterable', async () => {
    let controller: ReadableStreamDefaultController<string>;
    const source = new ReadableStream({
      start(ctrl) {
        controller = ctrl;
        controller.enqueue('chunk1');
        controller.enqueue('chunk2');
      },
    });

    const asyncIterableStream = createAsyncIterableStream(source);

    const collected: string[] = [];
    await expect(async () => {
      for await (const chunk of asyncIterableStream) {
        collected.push(chunk);
        if (chunk === 'chunk2') {
          controller.error(new Error('Stream error'));
        }
      }
    }).rejects.toThrow('Stream error');

    expect(collected).toEqual(['chunk1', 'chunk2']);
  });

  it('should stop async iterable when stream is cancelled', async () => {
    let iterationCompleted = false;
    let errorCaught: Error | null = null;

    const source = convertArrayToReadableStream(['chunk1', 'chunk2', 'chunk3']);

    const asyncIterableStream = createAsyncIterableStream(source);

    try {
      for await (const chunk of asyncIterableStream) {
        if (chunk === 'chunk1') {
          await asyncIterableStream.cancel('Test cancellation');
        }
      }
      iterationCompleted = true;
    } catch (error) {
      errorCaught = error as Error;
    }

    expect(iterationCompleted).toBe(false);
    expect(errorCaught).not.toBeNull();
  });

  it('should not collect any chunks when iterating on already cancelled stream', async () => {
    const source = convertArrayToReadableStream(['chunk1', 'chunk2', 'chunk3']);

    const asyncIterableStream = createAsyncIterableStream(source);

    await asyncIterableStream.cancel();

    const collected: string[] = [];
    for await (const chunk of asyncIterableStream) {
      collected.push(chunk);
    }

    expect(collected).toEqual([]);
  });
});
