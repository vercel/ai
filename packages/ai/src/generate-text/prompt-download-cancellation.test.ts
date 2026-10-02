import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MockLanguageModelV4 } from '../test/mock-language-model-v4';
import { generateText } from './generate-text';
import { streamText } from './stream-text';

type Settlement = 'fulfilled' | 'rejected' | 'pending';

const delay = (ms: number) =>
  new Promise<void>(resolve => setTimeout(resolve, ms));

async function settleWithin(
  operation: PromiseLike<unknown>,
  timeoutMs = 1_000,
): Promise<Settlement> {
  return await Promise.race([
    Promise.resolve(operation).then(
      () => 'fulfilled' as const,
      () => 'rejected' as const,
    ),
    delay(timeoutMs).then(() => 'pending' as const),
  ]);
}

function createPendingDownload() {
  const started = Promise.withResolvers<void>();
  let signal: AbortSignal | null | undefined;

  globalThis.fetch = vi.fn(async (_url, init) => {
    signal = init?.signal;
    started.resolve();

    return await new Promise<Response>((_resolve, reject) => {
      const abort = () => reject(signal?.reason);

      if (signal?.aborted) {
        abort();
      } else {
        signal?.addEventListener('abort', abort, { once: true });
      }
    });
  });

  return {
    started: started.promise,
    getSignal: () => signal,
  };
}

function createPrompt() {
  return {
    messages: [
      {
        role: 'user' as const,
        content: [
          {
            type: 'file' as const,
            mediaType: 'text/plain',
            data: new URL('https://example.com/file.txt'),
          },
        ],
      },
    ],
  };
}

describe('prompt attachment download cancellation', () => {
  const originalFetch = globalThis.fetch;
  const runtimeGlobal = globalThis as typeof globalThis & {
    EdgeRuntime?: string;
  };
  let originalEdgeRuntime: string | undefined;

  beforeEach(() => {
    originalEdgeRuntime = runtimeGlobal.EdgeRuntime;
    runtimeGlobal.EdgeRuntime = 'test';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalEdgeRuntime == null) {
      delete runtimeGlobal.EdgeRuntime;
    } else {
      runtimeGlobal.EdgeRuntime = originalEdgeRuntime;
    }
  });

  it('should cancel generateText downloads when the caller aborts', async () => {
    const download = createPendingDownload();
    const abortController = new AbortController();
    const doGenerate = vi.fn();
    const operation = generateText({
      model: new MockLanguageModelV4({
        supportedUrls: {},
        doGenerate,
      }),
      ...createPrompt(),
      abortSignal: abortController.signal,
      maxRetries: 0,
    });

    await download.started;
    abortController.abort(new DOMException('cancelled', 'AbortError'));

    expect(await settleWithin(operation)).toBe('rejected');
    expect(download.getSignal()).toBe(abortController.signal);
    expect(download.getSignal()?.aborted).toBe(true);
    expect(doGenerate).not.toHaveBeenCalled();
  });

  it('should cancel streamText downloads when the caller aborts', async () => {
    const download = createPendingDownload();
    const abortController = new AbortController();
    const doStream = vi.fn();
    const result = streamText({
      model: new MockLanguageModelV4({
        supportedUrls: {},
        doStream,
      }),
      ...createPrompt(),
      abortSignal: abortController.signal,
      maxRetries: 0,
      onError: () => {},
    });

    const operation = result.text;
    await download.started;
    abortController.abort(new DOMException('cancelled', 'AbortError'));

    expect(await settleWithin(operation)).not.toBe('pending');
    expect(download.getSignal()).toBe(abortController.signal);
    expect(download.getSignal()?.aborted).toBe(true);
    expect(doStream).not.toHaveBeenCalled();
  });

  it('should cancel downloads when the total timeout expires', async () => {
    const download = createPendingDownload();
    const doGenerate = vi.fn();
    const operation = generateText({
      model: new MockLanguageModelV4({
        supportedUrls: {},
        doGenerate,
      }),
      ...createPrompt(),
      timeout: { totalMs: 100 },
      maxRetries: 0,
    });

    await download.started;

    expect(await settleWithin(operation)).toBe('rejected');
    expect(download.getSignal()).toBeDefined();
    expect(download.getSignal()?.aborted).toBe(true);
    expect(doGenerate).not.toHaveBeenCalled();
  });
});
