import type {
  WebSocketConstructor,
  WebSocketLike,
} from '@ai-sdk/provider-utils';
import { WebSocketChatTransport } from 'ai';
import assert from 'node:assert/strict';

type SentFrame = {
  type: string;
  id?: string;
};

class FakeWebSocket implements WebSocketLike {
  static instances: FakeWebSocket[] = [];

  readyState = 0;
  bufferedAmount = 0;
  sent: SentFrame[] = [];
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onclose: ((event: unknown) => void) | null = null;

  constructor() {
    FakeWebSocket.instances.push(this);
    queueMicrotask(() => {
      this.readyState = 1;
      this.onopen?.({});
    });
  }

  send(data: string | Uint8Array | ArrayBuffer): void {
    this.sent.push(JSON.parse(String(data)) as SentFrame);
  }

  close(): void {
    this.readyState = 3;
  }
}

const webSocket = FakeWebSocket as unknown as WebSocketConstructor;

async function main() {
  let releasePreparation!: (body: object) => void;
  const preparation = new Promise<object>(resolve => {
    releasePreparation = resolve;
  });

  let preparationStarted!: () => void;
  const preparing = new Promise<void>(resolve => {
    preparationStarted = resolve;
  });

  let bodyCallCount = 0;
  const transport = new WebSocketChatTransport({
    url: 'ws://example.invalid',
    webSocket,
    body: () => {
      bodyCallCount += 1;
      if (bodyCallCount === 1) {
        preparationStarted();
        return preparation;
      }
      return {};
    },
  });

  const pendingRequest = transport
    .sendMessages({
      chatId: 'request-started-before-close',
      messageId: undefined,
      messages: [],
      trigger: 'submit-message',
      abortSignal: undefined,
    })
    .then(
      stream => ({ stream, error: undefined }),
      error => ({ stream: undefined, error: error as Error }),
    );

  await preparing;
  assert.equal(
    FakeWebSocket.instances.length,
    0,
    'The request must still be waiting for asynchronous preparation',
  );

  transport.close();
  releasePreparation({});

  const pendingResult = await pendingRequest;
  const requestsAfterClose = FakeWebSocket.instances
    .flatMap(socket => socket.sent)
    .filter(
      frame =>
        frame.type === 'send' && frame.id === 'request-started-before-close',
    ).length;

  await pendingResult.stream?.cancel();

  transport.close();
  const laterStream = await transport.sendMessages({
    chatId: 'request-started-after-close',
    messageId: undefined,
    messages: [],
    trigger: 'submit-message',
    abortSignal: undefined,
  });
  const laterRequests = FakeWebSocket.instances.flatMap(socket =>
    socket.sent.filter(
      frame =>
        frame.type === 'send' && frame.id === 'request-started-after-close',
    ),
  );
  assert.equal(
    laterRequests.length,
    1,
    'A genuinely new request after close() should still be sent',
  );
  await laterStream.cancel();
  transport.close();

  console.log({
    connectionsCreated: FakeWebSocket.instances.length,
    requestsAfterClose,
    pendingError: pendingResult.error?.message,
    laterRequests: laterRequests.length,
  });

  if (requestsAfterClose !== 0 || pendingResult.error == null) {
    throw new Error(
      'ISSUE #22722: close() allowed a pre-close sendMessages request to send after asynchronous preparation',
    );
  }
}

await main();
