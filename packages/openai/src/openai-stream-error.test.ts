import type { ParseResult } from '@ai-sdk/provider-utils';
import { describe, expect, it } from 'vitest';
import {
  createOpenAIProviderStreamError,
  throwIfOpenAIStreamErrorBeforeOutput,
} from './openai-stream-error';

type TestChunk =
  | { type: 'created' }
  | { type: 'accepted' }
  | { type: 'output'; text: string }
  | { type: 'error'; message: string };

function ok(chunk: TestChunk): ParseResult<TestChunk> {
  return { success: true, value: chunk, rawValue: chunk };
}

function getError(chunk: TestChunk): unknown | undefined {
  return chunk.type === 'error' ? { error: chunk } : undefined;
}

function isOutputChunk(chunk: TestChunk): boolean {
  return chunk.type === 'output';
}

function isAcceptedChunk(chunk: TestChunk): boolean {
  return chunk.type === 'accepted';
}

function createControlledStream(): {
  stream: ReadableStream<ParseResult<TestChunk>>;
  enqueue: (chunk: TestChunk) => void;
  close: () => void;
  error: (error: Error) => void;
  cancelReasons: unknown[];
} {
  let controller!: ReadableStreamDefaultController<ParseResult<TestChunk>>;
  const cancelReasons: unknown[] = [];
  const stream = new ReadableStream<ParseResult<TestChunk>>({
    start(c) {
      controller = c;
    },
    cancel(reason) {
      cancelReasons.push(reason);
    },
  });
  return {
    stream,
    enqueue: chunk => controller.enqueue(ok(chunk)),
    close: () => controller.close(),
    error: error => controller.error(error),
    cancelReasons,
  };
}

async function readAll(
  stream: ReadableStream<ParseResult<TestChunk>>,
): Promise<TestChunk[]> {
  const chunks: TestChunk[] = [];
  const reader = stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value.success) {
      chunks.push(value.value);
    }
  }
  return chunks;
}

const baseArgs = {
  getError,
  isOutputChunk,
  url: 'https://api.test.com/v1/responses',
  requestBodyValues: {},
};

describe('throwIfOpenAIStreamErrorBeforeOutput', () => {
  it('should throw when an error frame arrives before output without cancelling the source', async () => {
    const { stream, enqueue, close, cancelReasons } = createControlledStream();
    enqueue({ type: 'created' });
    enqueue({ type: 'error', message: 'quota exceeded' });

    await expect(
      throwIfOpenAIStreamErrorBeforeOutput({ ...baseArgs, stream }),
    ).rejects.toMatchObject({
      responseBody: expect.stringContaining('quota exceeded'),
    });

    expect(cancelReasons).toEqual([]);

    enqueue({ type: 'output', text: 'ignored' });
    close();
  });

  it('should resolve on the first output chunk and replay all chunks to the consumer', async () => {
    const { stream, enqueue, close } = createControlledStream();
    enqueue({ type: 'created' });
    enqueue({ type: 'output', text: 'hello' });
    close();

    const checked = await throwIfOpenAIStreamErrorBeforeOutput({
      ...baseArgs,
      stream,
    });

    expect(await readAll(checked)).toEqual([
      { type: 'created' },
      { type: 'output', text: 'hello' },
    ]);
  });

  it('should keep blocking until output when no accepted-chunk detector is provided', async () => {
    const { stream, enqueue, close } = createControlledStream();
    enqueue({ type: 'created' });
    enqueue({ type: 'accepted' });

    let resolved = false;
    const promise = throwIfOpenAIStreamErrorBeforeOutput({
      ...baseArgs,
      stream,
    }).then(result => {
      resolved = true;
      return result;
    });

    // give the grace window (which must not be armed here) time to fire:
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(resolved).toBe(false);

    enqueue({ type: 'output', text: 'late' });
    close();

    expect(await readAll(await promise)).toEqual([
      { type: 'created' },
      { type: 'accepted' },
      { type: 'output', text: 'late' },
    ]);
  });

  describe('with an accepted-chunk detector', () => {
    it('should resolve after the grace window when the stream stalls after acceptance', async () => {
      const { stream, enqueue, close } = createControlledStream();
      enqueue({ type: 'created' });
      enqueue({ type: 'accepted' });
      // no output chunk: the stream stalls (first token still pending)

      const checked = await throwIfOpenAIStreamErrorBeforeOutput({
        ...baseArgs,
        stream,
        isAcceptedChunk,
        acceptedGraceMs: 10,
      });

      // chunks that arrive after resolution still reach the consumer:
      enqueue({ type: 'output', text: 'late token' });
      close();

      expect(await readAll(checked)).toEqual([
        { type: 'created' },
        { type: 'accepted' },
        { type: 'output', text: 'late token' },
      ]);
    });

    it('should still throw when an error frame is flushed together with the accepted chunk', async () => {
      const { stream, enqueue, close } = createControlledStream();
      enqueue({ type: 'created' });
      enqueue({ type: 'accepted' });
      enqueue({ type: 'error', message: 'insufficient quota' });
      close();

      await expect(
        throwIfOpenAIStreamErrorBeforeOutput({
          ...baseArgs,
          stream,
          isAcceptedChunk,
          acceptedGraceMs: 10,
        }),
      ).rejects.toMatchObject({
        responseBody: expect.stringContaining('insufficient quota'),
      });
    });

    it('should surface a source error to the consumer after grace resolution without unhandled rejections', async () => {
      const { stream, enqueue, error } = createControlledStream();
      enqueue({ type: 'created' });
      enqueue({ type: 'accepted' });

      const checked = await throwIfOpenAIStreamErrorBeforeOutput({
        ...baseArgs,
        stream,
        isAcceptedChunk,
        acceptedGraceMs: 10,
      });

      // the source errors after the stream was already handed over (e.g. a
      // connection reset while waiting for the first token). The consumer
      // must see the error; the abandoned peek read must not surface as an
      // unhandled rejection (vitest fails the run if one occurs).
      error(new Error('connection reset'));

      await expect(readAll(checked)).rejects.toThrow('connection reset');
    });

    it('should resolve immediately on output without waiting for the grace window', async () => {
      const { stream, enqueue, close } = createControlledStream();
      enqueue({ type: 'created' });
      enqueue({ type: 'accepted' });
      enqueue({ type: 'output', text: 'hello' });
      close();

      const checked = await throwIfOpenAIStreamErrorBeforeOutput({
        ...baseArgs,
        stream,
        isAcceptedChunk,
        acceptedGraceMs: 60_000, // must not delay resolution
      });

      expect(await readAll(checked)).toEqual([
        { type: 'created' },
        { type: 'accepted' },
        { type: 'output', text: 'hello' },
      ]);
    });
  });
});

describe('createOpenAIProviderStreamError', () => {
  it('classifies a documented top-level rate-limit event', () => {
    const data = {
      type: 'error',
      code: 'rate_limit_exceeded',
      message: 'Rate limit reached',
      param: null,
    };

    expect(createOpenAIProviderStreamError(data)).toMatchObject({
      message: 'Rate limit reached',
      type: 'error',
      code: 'rate_limit_exceeded',
      statusCode: 429,
      isRetryable: true,
      data,
    });
  });

  it('classifies insufficient quota as non-retryable', () => {
    const data = {
      type: 'error',
      code: 'insufficient_quota',
      message: 'You exceeded your current quota.',
      param: null,
    };

    expect(createOpenAIProviderStreamError(data)).toMatchObject({
      message: 'You exceeded your current quota.',
      type: 'error',
      code: 'insufficient_quota',
      statusCode: 429,
      isRetryable: false,
      data,
    });
  });

  it('preserves the provider type when code is an HTTP status', () => {
    const data = {
      type: 'rate_limit_error',
      code: '429',
      message: 'Rate limit reached',
    };

    expect(createOpenAIProviderStreamError(data)).toMatchObject({
      message: 'Rate limit reached',
      type: 'rate_limit_error',
      code: '429',
      statusCode: 429,
      isRetryable: true,
      data,
    });
  });

  it('classifies a response.failed server error by its provider code', () => {
    const data = {
      type: 'response.failed',
      response: {
        error: {
          code: 'server_error',
          message: 'Response failed',
        },
      },
    };

    expect(createOpenAIProviderStreamError(data)).toMatchObject({
      message: 'Response failed',
      type: 'response.failed',
      code: 'server_error',
      statusCode: 500,
      isRetryable: true,
      data,
    });
  });
});
