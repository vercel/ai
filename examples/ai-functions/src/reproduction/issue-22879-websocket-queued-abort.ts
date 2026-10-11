import type {
  WebSocketConstructor,
  WebSocketLike,
} from '@ai-sdk/provider-utils';
import { WebSocketChatTransport } from 'ai';
import assert from 'node:assert/strict';

const failureSignal =
  'ISSUE_22879: queued abort remained pending behind unrelated WebSocket backpressure';

let socket: FakeSocket;

class FakeSocket implements WebSocketLike {
  readyState = 0;
  bufferedAmount = 2 * 1024 * 1024;
  sent: string[] = [];
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onclose: ((event: unknown) => void) | null = null;

  constructor() {
    socket = this;
    queueMicrotask(() => {
      this.readyState = 1;
      this.onopen?.({});
    });
  }

  send(data: string | Uint8Array | ArrayBuffer): void {
    this.sent.push(String(data));
  }

  close(): void {
    this.readyState = 3;
  }
}

const webSocket = FakeSocket as unknown as WebSocketConstructor;

const delay = (ms: number) =>
  new Promise<void>(resolve => setTimeout(resolve, ms));

async function main() {
  const transport = new WebSocketChatTransport({
    url: 'ws://example.invalid',
    webSocket,
  });
  const args = {
    messages: [],
    messageId: undefined,
    trigger: 'submit-message' as const,
  };

  let firstSettled = false;
  const first = transport
    .sendMessages({
      ...args,
      chatId: 'first',
      abortSignal: undefined,
    })
    .then(stream => {
      firstSettled = true;
      return stream;
    });

  await delay(30);

  const controller = new AbortController();
  const second = transport
    .sendMessages({
      ...args,
      chatId: 'second',
      abortSignal: controller.signal,
    })
    .then(
      stream => ({ status: 'resolved' as const, stream }),
      error => ({ status: 'rejected' as const, error }),
    );

  await delay(30);
  controller.abort();

  const promptResult = await Promise.race([
    second.then(result => ({ status: 'settled' as const, result })),
    delay(100).then(() => ({ status: 'timed-out' as const })),
  ]);
  const firstSettledBeforeDrain = firstSettled;
  const socketStateBeforeDrain = socket.readyState;

  // Always release the intentionally blocked first request before exiting.
  socket.bufferedAmount = 0;
  const firstStream = await first;
  const secondResult = await second;
  await firstStream.cancel();
  transport.close();

  if (promptResult.status === 'timed-out') {
    assert.equal(secondResult.status, 'rejected');
    assert.equal(secondResult.error?.name, 'AbortError');
    console.error(failureSignal);
    process.exitCode = 1;
    return;
  }

  assert.equal(promptResult.result.status, 'rejected');
  assert.equal(promptResult.result.error?.name, 'AbortError');
  assert.equal(
    firstSettledBeforeDrain,
    false,
    'aborting the queued request must not drain or settle the earlier request',
  );
  assert.equal(socketStateBeforeDrain, 1, 'the shared socket must remain open');
  assert.deepEqual(
    socket.sent
      .map(frame => JSON.parse(frame) as { type: string; id?: string })
      .filter(frame => frame.type === 'send')
      .map(frame => frame.id),
    ['first'],
    'the aborted queued request must never be transmitted',
  );
}

main().catch(error => {
  console.error('REPRODUCTION_HARNESS_ERROR', error);
  process.exitCode = 2;
});
