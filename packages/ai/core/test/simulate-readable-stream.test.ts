import { simulateReadableStream } from './simulate-readable-stream';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';

describe('simulateReadableStream', () => {
  it('should create a readable stream with provided values', async () => {
    const values = ['a', 'b', 'c'];
    const stream = simulateReadableStream({ chunks: values });

    expect(await convertReadableStreamToArray(stream)).toEqual(values);
  });

  it('should respect the chunkDelayInMs setting', async () => {
    const delayValues: number[] = [];
    const mockDelay = (ms: number) => {
      delayValues.push(ms);
      return Promise.resolve();
    };

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

  it('should skip delays when initialDelayInMs and chunkDelayInMs are null', async () => {
    const delayValues: number[] = [];
    const mockDelay = (ms: number) => {
      delayValues.push(ms);
      return Promise.resolve();
    };

    const stream = simulateReadableStream({
      chunks: [1, 2, 3],
      initialDelayInMs: null,
      chunkDelayInMs: null,
      _internal: { delay: mockDelay },
    });

    await convertReadableStreamToArray(stream); // consume stream

    expect(delayValues).toEqual([]);
  });

  it('should skip initial delay but apply chunk delays when only initialDelayInMs is null', async () => {
    const delayValues: number[] = [];
    const mockDelay = (ms: number) => {
      delayValues.push(ms);
      return Promise.resolve();
    };

    const stream = simulateReadableStream({
      chunks: [1, 2, 3],
      initialDelayInMs: null,
      chunkDelayInMs: 100,
      _internal: { delay: mockDelay },
    });

    await convertReadableStreamToArray(stream); // consume stream

    expect(delayValues).toEqual([100, 100]);
  });

  it('should apply initial delay but skip chunk delays when only chunkDelayInMs is null', async () => {
    const delayValues: number[] = [];
    const mockDelay = (ms: number) => {
      delayValues.push(ms);
      return Promise.resolve();
    };

    const stream = simulateReadableStream({
      chunks: [1, 2, 3],
      initialDelayInMs: 500,
      chunkDelayInMs: null,
      _internal: { delay: mockDelay },
    });

    await convertReadableStreamToArray(stream); // consume stream

    expect(delayValues).toEqual([500]);
  });
});
