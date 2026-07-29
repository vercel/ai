import type { ParseResult } from '@ai-sdk/provider-utils';
import { describe, expect, it } from 'vitest';
import { throwIfOpenAIStreamErrorBeforeOutput } from './openai-stream-error';

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
} {
  let controller!: ReadableStreamDefaultController<ParseResult<TestChunk>>;
  const stream = new ReadableStream<ParseResult<TestChunk>>({
    start(c) {
      controller = c;
    },
  });
  return {
    stream,
    enqueue: chunk => controller.enqueue(ok(chunk)),
    close: () => controller.close(),
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
  it('should throw when an error frame arrives before output', async () => {
    const { stream, enqueue, close } = createControlledStream();
    enqueue({ type: 'created' });
    enqueue({ type: 'error', message: 'quota exceeded' });
    close();

    await expect(
      throwIfOpenAIStreamErrorBeforeOutput({ ...baseArgs, stream }),
    ).rejects.toMatchObject({
      responseBody: expect.stringContaining('quota exceeded'),
    });
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
