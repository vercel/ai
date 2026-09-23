import type { LanguageModelV4StreamPart } from '@ai-sdk/provider';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it, vi } from 'vitest';
import { streamText } from '../generate-text/stream-text';
import { MockLanguageModelV4 } from '../test/mock-language-model-v4';
import { consumeStream } from '../util/consume-stream';
import { createUIMessageStreamResponse } from './create-ui-message-stream-response';
import type { UIMessageStreamOnEndCallback } from './ui-message-stream-on-end-callback';
import type { UIMessage } from '../ui/ui-messages';

const usage = {
  inputTokens: {
    total: 3,
    noCache: 3,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: {
    total: 1,
    text: 1,
    reasoning: undefined,
  },
};

function createAbortableModel() {
  return new MockLanguageModelV4({
    doStream: async ({ abortSignal }) => {
      let cleanup = () => {};

      return {
        stream: new ReadableStream<LanguageModelV4StreamPart>({
          start(controller) {
            controller.enqueue({ type: 'stream-start', warnings: [] });
            controller.enqueue({ type: 'text-start', id: 'text-1' });
            controller.enqueue({
              type: 'text-delta',
              id: 'text-1',
              delta: 'Hello',
            });

            const onAbort = () => {
              controller.error(
                abortSignal?.reason ??
                  new DOMException('The operation was aborted.', 'AbortError'),
              );
            };

            if (abortSignal?.aborted) {
              onAbort();
            } else {
              abortSignal?.addEventListener('abort', onAbort, { once: true });
              cleanup = () =>
                abortSignal?.removeEventListener('abort', onAbort);
            }
          },
          cancel() {
            cleanup();
          },
        }),
      };
    },
  });
}

type EndEvent = Parameters<UIMessageStreamOnEndCallback<UIMessage>>[0];

function setupStream() {
  const abortController = new AbortController();
  let onAbortFired = false;
  let resolveEnd!: (event: EndEvent) => void;
  const ended = new Promise<EndEvent>(resolve => {
    resolveEnd = resolve;
  });

  const result = streamText({
    model: createAbortableModel(),
    prompt: 'Hello',
    abortSignal: abortController.signal,
    onAbort: () => {
      onAbortFired = true;
    },
    onError: () => {},
  });

  return {
    abortController,
    ended,
    get onAbortFired() {
      return onAbortFired;
    },
    stream: result.toUIMessageStream({ onEnd: resolveEnd }),
  };
}

async function readUntilText(reader: ReadableStreamDefaultReader<Uint8Array>) {
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      throw new Error('Response ended before a text delta was received.');
    }
    if (decoder.decode(value, { stream: true }).includes('text-delta')) {
      return;
    }
  }
}

async function waitForEnd(ended: Promise<EndEvent>) {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      ended,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error('Timed out waiting for the onEnd callback.')),
          1_000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

async function runDisconnectScenario({
  consumeSseStream,
}: {
  consumeSseStream: boolean;
}) {
  let context: ReturnType<typeof setupStream> | undefined;

  const server = createServer((_request, response) => {
    context = setupStream();

    const webResponse = createUIMessageStreamResponse({
      stream: context.stream,
      ...(consumeSseStream ? { consumeSseStream: consumeStream } : {}),
    });
    response.writeHead(
      webResponse.status,
      Object.fromEntries(webResponse.headers.entries()),
    );

    const reader = webResponse.body!.getReader();
    response.on('close', () => {
      if (!response.writableFinished) {
        context!.abortController.abort();
        void reader.cancel();
      }
    });

    void (async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          response.write(value);
        }
        response.end();
      } catch {
        // The response reader is cancelled when the client disconnects.
      }
    })();
  });

  try {
    await new Promise<void>(resolve => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const { port } = server.address() as AddressInfo;

    const clientAbort = new AbortController();
    const response = await fetch(`http://127.0.0.1:${port}`, {
      signal: clientAbort.signal,
    });
    const clientReader = response.body!.getReader();
    await readUntilText(clientReader);
    clientAbort.abort();

    const event = await waitForEnd(context!.ended);

    await vi.waitFor(() => {
      expect(context!.onAbortFired).toBe(true);
    });

    return event;
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => {
      server.close(error => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }
}

describe('UI message stream HTTP cancellation', () => {
  it.each(['abort-first', 'cancel-first'] as const)(
    'reports consumer cancellation for the same-tick streamText race ($s)',
    async order => {
      const context = setupStream();
      const reader = context.stream.getReader();

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          throw new Error('Stream ended before a text delta was received.');
        }
        if (value.type === 'text-delta') {
          break;
        }
      }

      if (order === 'abort-first') {
        context.abortController.abort();
        await reader.cancel();
      } else {
        const cancelled = reader.cancel();
        context.abortController.abort();
        await cancelled;
      }

      const event = await waitForEnd(context.ended);
      await vi.waitFor(() => {
        expect(context.onAbortFired).toBe(true);
      });
      expect(event).toMatchObject({
        isAborted: false,
        isCancelled: true,
        outcome: { status: 'unknown' },
      });
    },
  );

  it('reports consumer cancellation when abort and response cancellation happen in the same tick', async () => {
    const event = await runDisconnectScenario({ consumeSseStream: false });

    expect(event).toMatchObject({
      isAborted: false,
      isCancelled: true,
      outcome: { status: 'unknown' },
    });
  });

  it('reports an observed abort when consumeSseStream keeps the source flowing', async () => {
    const event = await runDisconnectScenario({ consumeSseStream: true });

    expect(event).toMatchObject({
      isAborted: true,
      outcome: { status: 'aborted' },
    });
    expect(event.isCancelled).toBeUndefined();
  });
});
