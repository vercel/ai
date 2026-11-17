import { APICallError, type LanguageModelV4StreamPart } from '@ai-sdk/provider';
import { delay } from '@ai-sdk/provider-utils';
import { convertArrayToReadableStream } from '@ai-sdk/provider-utils/test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MockLanguageModelV4 } from '../test/mock-language-model-v4';
import { streamText, streamTextLowMemory } from './stream-text';

const successParts: LanguageModelV4StreamPart[] = [
  { type: 'text-start', id: 'text' },
  { type: 'text-delta', id: 'text', delta: 'hello' },
  { type: 'text-end', id: 'text' },
  {
    type: 'finish',
    finishReason: { unified: 'stop', raw: 'stop' },
    usage: {
      inputTokens: {
        total: 1,
        noCache: 1,
        cacheRead: undefined,
        cacheWrite: undefined,
      },
      outputTokens: { total: 1, text: 1, reasoning: undefined },
    },
  },
];

function createRecoveringModel({
  failures = 1,
  headers,
  error = new Error('temporarily overloaded'),
}: {
  failures?: number;
  headers?: Record<string, string>;
  error?: Error;
} = {}) {
  const calls: number[] = [];
  const model = new MockLanguageModelV4({
    doStream: async () => {
      calls.push(Date.now());
      return {
        response: { headers },
        stream: convertArrayToReadableStream(
          calls.length <= failures ? [{ type: 'error', error }] : successParts,
        ),
      };
    },
  });
  return { model, calls };
}

describe('streamText retry delay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should back off for 2s then 4s before recovering from an overload', async () => {
    const { model, calls } = createRecoveringModel({ failures: 2 });
    const result = streamText({
      model,
      prompt: 'test',
      streamRetries: 3,
      onError: () => {},
    });
    const consuming = result.consumeStream();
    await vi.advanceTimersByTimeAsync(1999);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(3999);
    expect(calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    await consuming;
    expect(calls.map(time => time - calls[0])).toEqual([0, 2000, 6000]);
    expect(await result.text).toBe('hello');
  });

  it.each<{ headers: Record<string, string>; expectedDelay: number }>([
    { headers: { 'retry-after': '1' }, expectedDelay: 1000 },
    { headers: { 'retry-after-ms': '125' }, expectedDelay: 125 },
    { headers: { 'Retry-After': '1' }, expectedDelay: 1000 },
    {
      headers: { 'retry-after': 'Thu, 01 Jan 2026 00:00:01 GMT' },
      expectedDelay: 1000,
    },
    {
      headers: { 'Retry-After-Ms': '125', 'retry-after': '1' },
      expectedDelay: 125,
    },
    { headers: { 'retry-after': 'invalid' }, expectedDelay: 2000 },
    { headers: { 'retry-after-ms': '-1' }, expectedDelay: 2000 },
    { headers: { 'retry-after': '60' }, expectedDelay: 2000 },
  ])(
    'should respect response headers $headers',
    async ({ headers, expectedDelay }) => {
      const { model, calls } = createRecoveringModel({ headers });
      const result = streamText({
        model,
        prompt: 'test',
        streamRetries: 1,
        onError: () => {},
      });
      const consuming = result.consumeStream();
      await vi.advanceTimersByTimeAsync(expectedDelay - 1);
      expect(calls).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1);
      await consuming;
      expect(calls[1] - calls[0]).toBe(expectedDelay);
      expect(await result.text).toBe('hello');
    },
  );

  it('should prefer error response headers over stream response headers', async () => {
    const { model, calls } = createRecoveringModel({
      headers: { 'retry-after': '1' },
      error: new APICallError({
        message: 'overloaded',
        url: 'https://example.com',
        requestBodyValues: {},
        statusCode: 503,
        responseHeaders: { 'Retry-After-Ms': '100' },
      }),
    });
    const result = streamText({
      model,
      prompt: 'test',
      streamRetries: 1,
      onError: () => {},
    });
    const consuming = result.consumeStream();
    await vi.advanceTimersByTimeAsync(100);
    await consuming;
    expect(calls[1] - calls[0]).toBe(100);
    expect(await result.text).toBe('hello');
  });

  it('should wait until onError completes before delaying callback-directed retries', async () => {
    const { model, calls } = createRecoveringModel();
    const result = streamText({
      model,
      prompt: 'test',
      streamRetries: 0,
      onError: async () => {
        await delay(500);
        return { retry: true };
      },
    });
    const consuming = result.consumeStream();
    await vi.advanceTimersByTimeAsync(2499);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    await consuming;
    expect(calls[1] - calls[0]).toBe(2500);
    expect(await result.text).toBe('hello');
  });

  it('should abort the retry wait without calling the provider again', async () => {
    const { model, calls } = createRecoveringModel();
    const abortController = new AbortController();
    const onAbort = vi.fn();
    const result = streamText({
      model,
      prompt: 'test',
      streamRetries: 1,
      abortSignal: abortController.signal,
      onAbort,
      onError: () => {},
    });
    const consuming = result.consumeStream();
    await vi.advanceTimersByTimeAsync(100);
    abortController.abort();
    await consuming;
    await vi.advanceTimersByTimeAsync(10000);
    expect(calls).toHaveLength(1);
    expect(onAbort).toHaveBeenCalledOnce();
  });

  it('should cancel the retry wait when the consumer cancels the stream', async () => {
    const { model, calls } = createRecoveringModel();
    const result = streamTextLowMemory({
      model,
      prompt: 'test',
      streamRetries: 1,
      onError: () => {},
    });
    const reader = result.stream.getReader();
    await reader.read();
    await vi.advanceTimersByTimeAsync(100);
    await reader.cancel();
    await vi.advanceTimersByTimeAsync(10000);
    expect(calls).toHaveLength(1);
  });
});
