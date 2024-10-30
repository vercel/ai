import { describe, it, expect, vi } from 'vitest';
import { simulateReadableStream } from './simulate-readable-stream';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';

describe('simulateReadableStream', () => {
  it('should create a readable stream with provided values', async () => {
    const values = ['a', 'b', 'c'];
    const stream = simulateReadableStream({ values });

    expect(await convertReadableStreamToArray(stream)).toEqual(values);
  });

  it('should respect the delay setting', async () => {
    const mockDelay = vi.fn();
    const delaySetting = 100;

    const stream = simulateReadableStream({
      values: [1, 2, 3],
      delayInMs: delaySetting,
      _internal: { delay: mockDelay },
    });

    await convertReadableStreamToArray(stream); // consume stream

    expect(mockDelay).toHaveBeenCalledTimes(3);
    expect(mockDelay).toHaveBeenCalledWith(delaySetting);
  });

  it('should handle empty values array', async () => {
    const stream = simulateReadableStream({ values: [] });
    const reader = stream.getReader();

    const { done, value } = await reader.read();

    expect(done).toBe(true);
    expect(value).toBeUndefined();
  });

  it('should handle different types of values', async () => {
    const stream = simulateReadableStream({
      values: [
        { id: 1, text: 'hello' },
        { id: 2, text: 'world' },
      ],
    });

    expect(await convertReadableStreamToArray(stream)).toEqual([
      { id: 1, text: 'hello' },
      { id: 2, text: 'world' },
    ]);
  });
});
