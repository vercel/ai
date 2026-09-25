import type {
  WebSocketConstructor,
  WebSocketLike,
} from '@ai-sdk/provider-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UIMessageChunk } from '../ui-message-stream/ui-message-chunks';
import {
  safeValidateWebSocketChatTransportRequest,
  WebSocketChatTransport,
  type WebSocketChatTransportRequest,
} from './websocket-chat-transport';
import type { UIMessage } from './ui-messages';

class MockWebSocket implements WebSocketLike {
  static instances: MockWebSocket[] = [];

  readyState = 0;
  bufferedAmount = 0;
  sent: string[] = [];
  onSend?: () => void;
  closeCalls: Array<{ code?: number; reason?: string }> = [];
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onclose: ((event: unknown) => void) | null = null;

  constructor(
    readonly url: string | URL,
    readonly protocols?: string | string[],
  ) {
    MockWebSocket.instances.push(this);
  }

  send(data: string | Uint8Array | ArrayBuffer): void {
    this.sent.push(String(data));
    this.onSend?.();
  }

  close(code?: number, reason?: string): void {
    this.closeCalls.push({ code, reason });
    this.readyState = 3;
  }

  open(): void {
    this.readyState = 1;
    this.onopen?.({});
  }

  receive(value: unknown): void {
    this.onmessage?.({ data: JSON.stringify(value) });
  }

  receiveBinary(value: unknown): void {
    this.onmessage?.({
      data: new TextEncoder().encode(JSON.stringify(value)),
    });
  }

  receiveBlob(value: unknown): void {
    this.onmessage?.({
      data: new Blob([JSON.stringify(value)]),
    });
  }

  fail(): void {
    this.onerror?.({});
  }

  finishClose(code = 1006, reason = ''): void {
    this.readyState = 3;
    this.onclose?.({ code, reason });
  }
}

const webSocket = MockWebSocket as unknown as WebSocketConstructor;

async function openPendingConnection(): Promise<MockWebSocket> {
  await vi.waitFor(() => {
    expect(MockWebSocket.instances).toHaveLength(1);
  });
  const socket = MockWebSocket.instances[0];
  socket.open();
  return socket;
}

function readFrame(socket: MockWebSocket, index = 0) {
  return JSON.parse(socket.sent[index]) as WebSocketChatTransportRequest;
}

describe('WebSocketChatTransport', () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
  });

  it('sends merged request configuration and transformed messages', async () => {
    const transport = new WebSocketChatTransport<UIMessage>({
      url: 'https://example.com/chat?existing=yes',
      protocols: ['ai-chat'],
      params: { token: 'abc' },
      headers: { Authorization: 'Bearer transport' },
      body: { transportValue: true },
      webSocket,
      prepareSendMessagesRequest: options => ({
        messages: options.messages.slice(-1),
        headers: { ...options.headers, 'x-prepared': 'yes' },
        body: { ...options.body, prepared: true },
      }),
    });

    const sendPromise = transport.sendMessages({
      chatId: 'chat-1',
      messageId: 'message-2',
      trigger: 'submit-message',
      messages: [
        {
          id: 'message-1',
          role: 'user',
          parts: [{ type: 'text', text: 'first' }],
        },
        {
          id: 'message-2',
          role: 'user',
          parts: [{ type: 'text', text: 'second' }],
        },
      ],
      headers: { Authorization: 'Bearer request' },
      body: { requestValue: true },
      metadata: { source: 'test' },
      abortSignal: new AbortController().signal,
    });

    const socket = await openPendingConnection();
    await sendPromise;

    expect(String(socket.url)).toBe(
      'wss://example.com/chat?existing=yes&token=abc',
    );
    expect(socket.protocols).toEqual(['ai-chat']);
    expect(readFrame(socket)).toMatchObject({
      type: 'send',
      id: 'chat-1',
      trigger: 'submit-message',
      messageId: 'message-2',
      messages: [
        {
          id: 'message-2',
          role: 'user',
          parts: [{ type: 'text', text: 'second' }],
        },
      ],
      headers: {
        authorization: 'Bearer request',
        'x-prepared': 'yes',
      },
      body: {
        transportValue: true,
        requestValue: true,
        prepared: true,
      },
      metadata: { source: 'test' },
    });
  });

  it('streams validated chunks and closes on end', async () => {
    const transport = new WebSocketChatTransport<UIMessage>({
      url: 'wss://example.com/chat',
      webSocket,
    });

    const streamPromise = transport.sendMessages({
      chatId: 'chat-1',
      messageId: 'message-1',
      trigger: 'submit-message',
      messages: [],
      abortSignal: undefined,
    });
    const socket = await openPendingConnection();
    const stream = await streamPromise;
    const frame = readFrame(socket);
    const reader = stream.getReader();

    socket.receiveBinary({
      type: 'chunk',
      requestId: frame.requestId,
      sequence: 0,
      chunk: { type: 'text-start', id: 'text-1' },
    });
    await expect(reader.read()).resolves.toEqual({
      done: false,
      value: { type: 'text-start', id: 'text-1' },
    });

    socket.receive({ type: 'end', requestId: frame.requestId });
    await expect(reader.read()).resolves.toEqual({
      done: true,
      value: undefined,
    });
  });

  it('reuses one connection for sequential requests', async () => {
    const transport = new WebSocketChatTransport<UIMessage>({
      url: 'wss://example.com/chat',
      webSocket,
    });

    const firstPromise = transport.sendMessages({
      chatId: 'chat-1',
      messageId: 'message-1',
      trigger: 'submit-message',
      messages: [],
      abortSignal: undefined,
    });
    const socket = await openPendingConnection();
    const firstStream = await firstPromise;
    const firstFrame = readFrame(socket);
    socket.receive({ type: 'end', requestId: firstFrame.requestId });
    await firstStream.pipeTo(new WritableStream());

    await transport.sendMessages({
      chatId: 'chat-1',
      messageId: 'message-2',
      trigger: 'submit-message',
      messages: [],
      abortSignal: undefined,
    });

    expect(MockWebSocket.instances).toHaveLength(1);
    expect(socket.sent).toHaveLength(2);
  });

  it('correlates concurrent response streams by request id', async () => {
    const transport = new WebSocketChatTransport<UIMessage>({
      url: 'wss://example.com/chat',
      webSocket,
    });

    const firstPromise = transport.sendMessages({
      chatId: 'chat-1',
      messageId: 'message-1',
      trigger: 'submit-message',
      messages: [],
      abortSignal: undefined,
    });
    const secondPromise = transport.sendMessages({
      chatId: 'chat-2',
      messageId: 'message-2',
      trigger: 'submit-message',
      messages: [],
      abortSignal: undefined,
    });

    const socket = await openPendingConnection();
    const [firstStream, secondStream] = await Promise.all([
      firstPromise,
      secondPromise,
    ]);
    const firstFrame = readFrame(socket, 0);
    const secondFrame = readFrame(socket, 1);
    const firstReader = firstStream.getReader();
    const secondReader = secondStream.getReader();

    const secondChunk: UIMessageChunk = {
      type: 'text-start',
      id: 'second',
    };
    const firstChunk: UIMessageChunk = { type: 'text-start', id: 'first' };
    socket.receive({
      type: 'chunk',
      requestId: secondFrame.requestId,
      sequence: 0,
      chunk: secondChunk,
    });
    socket.receive({
      type: 'chunk',
      requestId: firstFrame.requestId,
      sequence: 0,
      chunk: firstChunk,
    });

    await expect(firstReader.read()).resolves.toMatchObject({
      value: firstChunk,
    });
    await expect(secondReader.read()).resolves.toMatchObject({
      value: secondChunk,
    });
  });

  it('keeps shared requests usable when another request aborts during chunk validation', async () => {
    const firstAbortController = new AbortController();
    const transport = new WebSocketChatTransport<UIMessage>({
      url: 'wss://example.com/chat',
      webSocket,
    });
    let continueValidation!: () => void;
    const validationGate = new Promise<void>(resolve => {
      continueValidation = resolve;
    });
    const validationStarted = vi.fn();
    vi.spyOn(
      transport as unknown as {
        validateResponseChunk(value: unknown): Promise<UIMessageChunk>;
      },
      'validateResponseChunk',
    ).mockImplementation(async value => {
      validationStarted();
      await validationGate;
      return value as UIMessageChunk;
    });

    const firstPromise = transport.sendMessages({
      chatId: 'chat-1',
      messageId: 'message-1',
      trigger: 'submit-message',
      messages: [],
      abortSignal: firstAbortController.signal,
    });
    const secondPromise = transport.sendMessages({
      chatId: 'chat-2',
      messageId: 'message-2',
      trigger: 'submit-message',
      messages: [],
      abortSignal: undefined,
    });

    const socket = await openPendingConnection();
    const [firstStream, secondStream] = await Promise.all([
      firstPromise,
      secondPromise,
    ]);
    const firstReader = firstStream.getReader();
    const secondReader = secondStream.getReader();
    const frames = [readFrame(socket, 0), readFrame(socket, 1)];
    const firstFrame = frames.find(
      frame => frame.type === 'send' && frame.id === 'chat-1',
    )!;
    const secondFrame = frames.find(
      frame => frame.type === 'send' && frame.id === 'chat-2',
    )!;

    socket.receive({
      type: 'chunk',
      requestId: firstFrame.requestId,
      sequence: 0,
      chunk: { type: 'text-start', id: 'first' },
    });
    await vi.waitFor(() => {
      expect(validationStarted).toHaveBeenCalledOnce();
    });

    firstAbortController.abort();
    await expect(firstReader.read()).resolves.toEqual({
      done: true,
      value: undefined,
    });

    continueValidation();
    socket.receive({
      type: 'chunk',
      requestId: secondFrame.requestId,
      sequence: 0,
      chunk: { type: 'text-start', id: 'second' },
    });

    await expect(secondReader.read()).resolves.toEqual({
      done: false,
      value: { type: 'text-start', id: 'second' },
    });
    expect(socket.closeCalls).toEqual([]);
  });

  it('sends an abort frame and closes the local stream', async () => {
    const abortController = new AbortController();
    const transport = new WebSocketChatTransport<UIMessage>({
      url: 'wss://example.com/chat',
      webSocket,
    });

    const streamPromise = transport.sendMessages({
      chatId: 'chat-1',
      messageId: 'message-1',
      trigger: 'submit-message',
      messages: [],
      abortSignal: abortController.signal,
    });
    const socket = await openPendingConnection();
    const stream = await streamPromise;
    const sendFrame = readFrame(socket);
    const reader = stream.getReader();

    abortController.abort();

    await expect(reader.read()).resolves.toEqual({
      done: true,
      value: undefined,
    });
    await vi.waitFor(() => {
      expect(readFrame(socket, 1)).toEqual({
        type: 'abort',
        requestId: sendFrame.requestId,
      });
    });
  });

  it('returns null when a resume request has no active stream', async () => {
    const transport = new WebSocketChatTransport<UIMessage>({
      url: 'wss://example.com/chat',
      webSocket,
    });

    const resumePromise = transport.reconnectToStream({
      chatId: 'chat-1',
    });
    const socket = await openPendingConnection();
    await vi.waitFor(() => {
      expect(socket.sent).toHaveLength(1);
    });
    const frame = readFrame(socket);
    expect(frame.type).toBe('resume');

    socket.receive({ type: 'no-active', requestId: frame.requestId });

    await expect(resumePromise).resolves.toBeNull();
  });

  it('returns a resume stream on start before the first chunk', async () => {
    const transport = new WebSocketChatTransport<UIMessage>({
      url: 'wss://example.com/chat',
      webSocket,
    });

    const resumePromise = transport.reconnectToStream({
      chatId: 'chat-1',
    });
    const socket = await openPendingConnection();
    await vi.waitFor(() => {
      expect(socket.sent).toHaveLength(1);
    });
    const frame = readFrame(socket);

    socket.receive({ type: 'start', requestId: frame.requestId });
    const stream = await resumePromise;

    expect(stream).toBeInstanceOf(ReadableStream);
  });

  it('resumes after the last received sequence and ignores replayed chunks', async () => {
    const transport = new WebSocketChatTransport<UIMessage>({
      url: 'wss://example.com/chat',
      webSocket,
    });

    const streamPromise = transport.sendMessages({
      chatId: 'chat-1',
      messageId: 'message-1',
      trigger: 'submit-message',
      messages: [],
      abortSignal: undefined,
    });
    const firstSocket = await openPendingConnection();
    const firstReader = (await streamPromise).getReader();
    const firstFrame = readFrame(firstSocket);

    firstSocket.receive({
      type: 'chunk',
      requestId: firstFrame.requestId,
      sequence: 0,
      chunk: { type: 'text-start', id: 'text-1' },
    });
    await expect(firstReader.read()).resolves.toMatchObject({
      value: { type: 'text-start', id: 'text-1' },
    });
    firstSocket.finishClose();
    await expect(firstReader.read()).rejects.toThrow();

    const resumePromise = transport.reconnectToStream({
      chatId: 'chat-1',
    });
    await vi.waitFor(() => {
      expect(MockWebSocket.instances).toHaveLength(2);
    });
    const secondSocket = MockWebSocket.instances[1];
    secondSocket.open();
    await vi.waitFor(() => {
      expect(secondSocket.sent).toHaveLength(1);
    });
    const resumeFrame = readFrame(secondSocket);
    expect(resumeFrame).toMatchObject({
      type: 'resume',
      lastSequence: 0,
    });

    secondSocket.receive({
      type: 'start',
      requestId: resumeFrame.requestId,
    });
    const resumeReader = (await resumePromise)!.getReader();
    secondSocket.receive({
      type: 'chunk',
      requestId: resumeFrame.requestId,
      sequence: 0,
      chunk: { type: 'text-start', id: 'text-1' },
    });
    secondSocket.receive({
      type: 'chunk',
      requestId: resumeFrame.requestId,
      sequence: 1,
      chunk: { type: 'text-delta', id: 'text-1', delta: 'hello' },
    });

    await expect(resumeReader.read()).resolves.toMatchObject({
      value: { type: 'text-delta', id: 'text-1', delta: 'hello' },
    });
  });

  it('serializes concurrent writes before checking backpressure', async () => {
    const transport = new WebSocketChatTransport<UIMessage>({
      url: 'wss://example.com/chat',
      webSocket,
    });

    const firstPromise = transport.sendMessages({
      chatId: 'chat-1',
      messageId: 'message-1',
      trigger: 'submit-message',
      messages: [],
      abortSignal: undefined,
    });
    const secondPromise = transport.sendMessages({
      chatId: 'chat-2',
      messageId: 'message-2',
      trigger: 'submit-message',
      messages: [],
      abortSignal: undefined,
    });
    const socket = await openPendingConnection();
    socket.onSend = () => {
      if (socket.sent.length === 1) {
        socket.bufferedAmount = 2 * 1024 * 1024;
      }
    };

    await firstPromise;
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(socket.sent).toHaveLength(1);

    socket.bufferedAmount = 0;
    await secondPromise;
    expect(socket.sent).toHaveLength(2);
  });

  it('decodes Blob response frames', async () => {
    const transport = new WebSocketChatTransport<UIMessage>({
      url: 'wss://example.com/chat',
      webSocket,
    });

    const streamPromise = transport.sendMessages({
      chatId: 'chat-1',
      messageId: 'message-1',
      trigger: 'submit-message',
      messages: [],
      abortSignal: undefined,
    });
    const socket = await openPendingConnection();
    const reader = (await streamPromise).getReader();
    const frame = readFrame(socket);

    socket.receiveBlob({
      type: 'chunk',
      requestId: frame.requestId,
      sequence: 0,
      chunk: { type: 'text-start', id: 'text-1' },
    });

    await expect(reader.read()).resolves.toMatchObject({
      value: { type: 'text-start', id: 'text-1' },
    });
  });

  it('errors a stream when the server sends an error frame', async () => {
    const transport = new WebSocketChatTransport<UIMessage>({
      url: 'wss://example.com/chat',
      webSocket,
    });

    const streamPromise = transport.sendMessages({
      chatId: 'chat-1',
      messageId: 'message-1',
      trigger: 'submit-message',
      messages: [],
      abortSignal: undefined,
    });
    const socket = await openPendingConnection();
    const reader = (await streamPromise).getReader();
    const frame = readFrame(socket);

    socket.receive({
      type: 'error',
      requestId: frame.requestId,
      errorText: 'Request failed.',
    });

    await expect(reader.read()).rejects.toThrow('Request failed.');
  });

  it('rejects nullable error text as an invalid response frame', async () => {
    const transport = new WebSocketChatTransport<UIMessage>({
      url: 'wss://example.com/chat',
      webSocket,
    });

    const streamPromise = transport.sendMessages({
      chatId: 'chat-1',
      messageId: 'message-1',
      trigger: 'submit-message',
      messages: [],
      abortSignal: undefined,
    });
    const socket = await openPendingConnection();
    const reader = (await streamPromise).getReader();
    const frame = readFrame(socket);

    socket.receive({
      type: 'error',
      requestId: frame.requestId,
      errorText: null,
    });

    await expect(reader.read()).rejects.toThrow(
      'Invalid WebSocket chat error response.',
    );
    expect(socket.closeCalls).toEqual([
      { code: 1011, reason: 'WebSocket chat transport error' },
    ]);
  });

  it('closes the connection for an unknown active response type', async () => {
    const transport = new WebSocketChatTransport<UIMessage>({
      url: 'wss://example.com/chat',
      webSocket,
    });

    const streamPromise = transport.sendMessages({
      chatId: 'chat-1',
      messageId: 'message-1',
      trigger: 'submit-message',
      messages: [],
      abortSignal: undefined,
    });
    const socket = await openPendingConnection();
    const reader = (await streamPromise).getReader();
    const frame = readFrame(socket);

    socket.receive({ type: 'future-frame', requestId: frame.requestId });

    await expect(reader.read()).rejects.toThrow(
      'Unknown WebSocket chat response type: future-frame.',
    );
    expect(socket.closeCalls).toEqual([
      { code: 1011, reason: 'WebSocket chat transport error' },
    ]);
  });

  it('rejects out-of-order response chunks', async () => {
    const transport = new WebSocketChatTransport<UIMessage>({
      url: 'wss://example.com/chat',
      webSocket,
    });

    const streamPromise = transport.sendMessages({
      chatId: 'chat-1',
      messageId: 'message-1',
      trigger: 'submit-message',
      messages: [],
      abortSignal: undefined,
    });
    const socket = await openPendingConnection();
    const reader = (await streamPromise).getReader();
    const frame = readFrame(socket);

    socket.receive({
      type: 'chunk',
      requestId: frame.requestId,
      sequence: 1,
      chunk: { type: 'text-start', id: 'text-1' },
    });

    await expect(reader.read()).rejects.toThrow(
      'Out-of-order WebSocket chat chunk sequence.',
    );
  });

  it('does not send a request aborted while the connection is pending', async () => {
    const abortController = new AbortController();
    const transport = new WebSocketChatTransport<UIMessage>({
      url: 'wss://example.com/chat',
      webSocket,
    });

    const sendPromise = transport.sendMessages({
      chatId: 'chat-1',
      messageId: 'message-1',
      trigger: 'submit-message',
      messages: [],
      abortSignal: abortController.signal,
    });
    await vi.waitFor(() => {
      expect(MockWebSocket.instances).toHaveLength(1);
    });
    abortController.abort();

    await expect(sendPromise).rejects.toMatchObject({ name: 'AbortError' });
    expect(MockWebSocket.instances[0].sent).toHaveLength(0);
  });

  it('handles abort, connection close, and transport close races', async () => {
    const abortController = new AbortController();
    const transport = new WebSocketChatTransport<UIMessage>({
      url: 'wss://example.com/chat',
      webSocket,
    });

    const streamPromise = transport.sendMessages({
      chatId: 'chat-1',
      messageId: 'message-1',
      trigger: 'submit-message',
      messages: [],
      abortSignal: abortController.signal,
    });
    const socket = await openPendingConnection();
    const reader = (await streamPromise).getReader();

    abortController.abort();
    socket.finishClose();
    transport.close();

    await expect(reader.read()).resolves.toEqual({
      done: true,
      value: undefined,
    });
  });

  it('errors active streams when the connection closes unexpectedly', async () => {
    const transport = new WebSocketChatTransport<UIMessage>({
      url: 'wss://example.com/chat',
      webSocket,
    });

    const streamPromise = transport.sendMessages({
      chatId: 'chat-1',
      messageId: 'message-1',
      trigger: 'submit-message',
      messages: [],
      abortSignal: undefined,
    });
    const socket = await openPendingConnection();
    const reader = (await streamPromise).getReader();

    socket.finishClose(1006, 'network lost');

    await expect(reader.read()).rejects.toThrow(
      'WebSocket chat network connection closed (code 1006: network lost).',
    );
  });

  it('closes the connection when a response frame is malformed', async () => {
    const transport = new WebSocketChatTransport<UIMessage>({
      url: 'wss://example.com/chat',
      webSocket,
    });

    const streamPromise = transport.sendMessages({
      chatId: 'chat-1',
      messageId: 'message-1',
      trigger: 'submit-message',
      messages: [],
      abortSignal: undefined,
    });
    const socket = await openPendingConnection();
    const reader = (await streamPromise).getReader();

    socket.onmessage?.({ data: '{"type":"chunk"}' });

    await expect(reader.read()).rejects.toThrow(
      'Invalid WebSocket chat response frame.',
    );
    expect(socket.closeCalls).toEqual([
      { code: 1011, reason: 'WebSocket chat transport error' },
    ]);
  });

  it('close releases the socket and the next request opens a new one', async () => {
    const transport = new WebSocketChatTransport<UIMessage>({
      url: 'wss://example.com/chat',
      webSocket,
    });

    const firstPromise = transport.sendMessages({
      chatId: 'chat-1',
      messageId: 'message-1',
      trigger: 'submit-message',
      messages: [],
      abortSignal: undefined,
    });
    const firstSocket = await openPendingConnection();
    const firstReader = (await firstPromise).getReader();

    transport.close();

    await expect(firstReader.read()).rejects.toThrow(
      'WebSocket chat transport was closed.',
    );
    expect(firstSocket.closeCalls).toEqual([
      { code: 1000, reason: 'Client closed transport' },
    ]);

    const secondPromise = transport.sendMessages({
      chatId: 'chat-1',
      messageId: 'message-2',
      trigger: 'submit-message',
      messages: [],
      abortSignal: undefined,
    });
    await vi.waitFor(() => {
      expect(MockWebSocket.instances).toHaveLength(2);
    });
    MockWebSocket.instances[1].open();
    await secondPromise;
  });
});

describe('safeValidateWebSocketChatTransportRequest', () => {
  it('validates UI messages and rejects malformed envelopes', async () => {
    await expect(
      safeValidateWebSocketChatTransportRequest({
        value: {
          type: 'send',
          requestId: 'request-1',
          id: 'chat-1',
          trigger: 'submit-message',
          messages: [
            {
              id: 'message-1',
              role: 'user',
              parts: [{ type: 'text', text: 'hello' }],
            },
          ],
          headers: {},
          body: {},
          metadata: undefined,
        },
      }),
    ).resolves.toMatchObject({ success: true });

    await expect(
      safeValidateWebSocketChatTransportRequest({
        value: {
          type: 'send',
          requestId: 'request-1',
          id: 'chat-1',
          trigger: 'submit-message',
          messages: [{ role: 'user', parts: [] }],
          headers: {},
          body: {},
        },
      }),
    ).resolves.toMatchObject({ success: false });
  });

  it.each([
    {
      name: 'null resume sequence',
      value: {
        type: 'resume',
        requestId: 'request-1',
        id: 'chat-1',
        lastSequence: null,
        headers: {},
        body: {},
        metadata: undefined,
      },
    },
    {
      name: 'null send message id',
      value: {
        type: 'send',
        requestId: 'request-1',
        id: 'chat-1',
        trigger: 'submit-message',
        messageId: null,
        messages: [],
        headers: {},
        body: {},
        metadata: undefined,
      },
    },
  ])('rejects $name', async ({ value }) => {
    await expect(
      safeValidateWebSocketChatTransportRequest({ value }),
    ).resolves.toMatchObject({ success: false });
  });
});
