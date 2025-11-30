import { describe, it, expect, vi } from 'vitest';
import { WebSocketChatTransport } from './websocket-chat-transport';
import { UIMessage } from './ui-messages';

class MockWebSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  readyState = MockWebSocket.OPEN;
  sent: string[] = [];
  private _onopen: (() => void) | null = null;
  onmessage: ((evt: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(public url: string) {}

  // Auto-trigger onopen when assigned if already open
  set onopen(handler: (() => void) | null) {
    this._onopen = handler;
    if (this.readyState === MockWebSocket.OPEN && handler) {
      // Use setTimeout to make it async like real WebSocket
      setTimeout(() => handler(), 0);
    }
  }

  get onopen() {
    return this._onopen;
  }

  send(data: string) {
    this.sent.push(data);
  }
  triggerOpen() {
    this._onopen?.();
  }
  triggerMessage(data: any) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
  triggerClose() {
    this.onclose?.();
  }
  triggerError() {
    this.onerror?.();
  }
}

describe('WebSocketChatTransport', () => {
  it('sends headers and body in outbound send message', async () => {
    const ws = new MockWebSocket('wss://example.test');
    const transport = new WebSocketChatTransport<UIMessage>({
      url: 'wss://example.test',
      headers: { 'X-Test': 'yes' },
      body: { someData: true },
      makeWebSocket: () => ws as unknown as WebSocket,
    });

    const stream = await transport.sendMessages({
      chatId: 'c1',
      messageId: 'm1',
      trigger: 'submit-message',
      messages: [
        { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'hi' }] },
      ],
      abortSignal: new AbortController().signal,
    });

    const outbound = JSON.parse(ws.sent[0]);
    expect(outbound.type).toBe('send');
    expect(outbound.id).toBe('c1');
    expect(outbound.messageId).toBe('m1');
    expect(outbound.headers['X-Test']).toBe('yes');
    expect(outbound.body.someData).toBe(true);
  });

  it('resume returns null when server indicates no-active', async () => {
    const ws = new MockWebSocket('wss://example.test');
    const transport = new WebSocketChatTransport<UIMessage>({
      url: 'wss://example.test',
      makeWebSocket: () => ws as unknown as WebSocket,
    });

    const resumePromise = transport.reconnectToStream({
      chatId: 'c2',
    });

    // Wait for connection and message to be sent
    await new Promise(resolve => setTimeout(resolve, 10));

    // capture requestId from sent message
    const sent = JSON.parse(ws.sent[0]);
    expect(sent.type).toBe('resume');

    // server responds with no-active
    ws.triggerMessage({ type: 'no-active', requestId: sent.requestId });

    const result = await resumePromise;
    expect(result).toBeNull();
  });

  it('sendMessages stream closes on end', async () => {
    const ws = new MockWebSocket('wss://example.test');
    const transport = new WebSocketChatTransport<UIMessage>({
      url: 'wss://example.test',
      makeWebSocket: () => ws as unknown as WebSocket,
    });

    const stream = await transport.sendMessages({
      chatId: 'c3',
      messageId: 'm3',
      trigger: 'submit-message',
      messages: [
        { id: 'm3', role: 'user', parts: [{ type: 'text', text: 'hi' }] },
      ],
      abortSignal: new AbortController().signal,
    });

    const sent = JSON.parse(ws.sent[0]);
    const reader = stream.getReader();

    // push a chunk and then end
    ws.triggerMessage({
      type: 'chunk',
      requestId: sent.requestId,
      chunk: { type: 'text-start', id: 'id1' },
    });

    const { value, done } = await reader.read();
    expect(done).toBe(false);
    expect(value).toEqual({ type: 'text-start', id: 'id1' });

    ws.triggerMessage({ type: 'end', requestId: sent.requestId });
    const r2 = await reader.read();
    expect(r2.done).toBe(true);
  });
});
