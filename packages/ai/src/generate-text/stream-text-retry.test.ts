import {
  APICallError,
  type LanguageModelV4,
  type LanguageModelV4StreamPart,
  type LanguageModelV4Usage,
} from '@ai-sdk/provider';
import {
  convertArrayToReadableStream,
  convertAsyncIterableToArray,
} from '@ai-sdk/provider-utils/test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MockLanguageModelV4 } from '../test/mock-language-model-v4';
import { streamText } from './stream-text';

const testUsage: LanguageModelV4Usage = {
  inputTokens: {
    total: 3,
    noCache: 3,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: {
    total: 10,
    text: 10,
    reasoning: undefined,
  },
};

describe('streamText response stream retries', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should retry when a retryable error interrupts the response stream', async () => {
    const streamError = new APICallError({
      message: 'Cannot connect to API: terminated',
      cause: Object.assign(new Error('other side closed'), {
        code: 'UND_ERR_SOCKET',
      }),
      url: 'https://api.example.com/v1/chat',
      requestBodyValues: { prompt: 'test-input' },
      isRetryable: true,
    });
    const doStream = vi
      .fn<LanguageModelV4['doStream']>()
      .mockImplementationOnce(async () => ({
        response: { headers: { attempt: '1' } },
        stream: new ReadableStream<LanguageModelV4StreamPart>({
          start(controller) {
            controller.enqueue({ type: 'text-start', id: '1' });
            controller.enqueue({
              type: 'text-delta',
              id: '1',
              delta: 'partial',
            });
            setTimeout(() => controller.error(streamError), 1);
          },
        }),
      }))
      .mockImplementationOnce(async () => ({
        response: { headers: { attempt: '2' } },
        stream: convertArrayToReadableStream([
          {
            type: 'response-metadata',
            id: 'response-2',
            modelId: 'mock-model-id',
            timestamp: new Date(0),
          },
          { type: 'text-start', id: '2' },
          { type: 'text-delta', id: '2', delta: 'complete' },
          { type: 'text-end', id: '2' },
          {
            type: 'finish',
            finishReason: { unified: 'stop', raw: 'stop' },
            usage: testUsage,
          },
        ]),
      }));

    const result = streamText({
      model: new MockLanguageModelV4({ doStream }),
      prompt: 'test-input',
      maxRetries: 1,
    });
    const textStreamPromise = convertAsyncIterableToArray(result.textStream);

    await vi.advanceTimersByTimeAsync(2001);

    expect(await textStreamPromise).toStrictEqual(['partial', 'complete']);
    expect(await result.response).toMatchObject({
      headers: { attempt: '2' },
      id: 'response-2',
    });
    expect(doStream).toHaveBeenCalledTimes(2);
  });
});
