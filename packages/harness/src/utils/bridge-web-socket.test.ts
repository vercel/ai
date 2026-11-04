import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import { HarnessError } from '../errors/harness-error';
import {
  createBridgeWebSocketConnect,
  type CreateBridgeWebSocketConnectOptions,
} from './bridge-web-socket';

type Listener = (...args: unknown[]) => void;

const sockets: FakeWebSocket[] = [];
const scripts: Array<(socket: FakeWebSocket) => void> = [];

class FakeWebSocket {
  readonly listeners = new Map<string, Set<Listener>>();
  terminated = false;
  closed = false;
  emitErrorOnTerminate = false;

  constructor(
    readonly url: string,
    readonly options?: { headers?: Record<string, string> },
  ) {
    sockets.push(this);
    const script = scripts.shift();
    if (script != null) queueMicrotask(() => script(this));
  }

  on(type: string, listener: Listener): this {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
    return this;
  }

  off(type: string, listener: Listener): this {
    this.listeners.get(type)?.delete(listener);
    return this;
  }

  emit(type: string, ...args: unknown[]): void {
    const listeners = [...(this.listeners.get(type) ?? [])];
    if (type === 'error' && listeners.length === 0) {
      throw args[0];
    }
    for (const listener of listeners) listener(...args);
  }

  sendHello(capabilities?: Record<string, unknown>): void {
    this.emit(
      'message',
      Buffer.from(
        JSON.stringify({
          type: 'bridge-hello',
          ...(capabilities == null ? {} : { capabilities }),
        }),
      ),
    );
  }

  terminate(): void {
    this.terminated = true;
    if (this.emitErrorOnTerminate) {
      this.emit('error', new Error('terminated while connecting'));
    }
  }

  close(): void {
    this.closed = true;
  }
}

function createConnect(
  options: Partial<CreateBridgeWebSocketConnectOptions> = {},
) {
  return createBridgeWebSocketConnect({
    endpoint: {
      url: 'wss://bridge.example/?agent_bridge_token=token',
      headers: { 'x-access-token': 'traffic-token' },
    },
    webSocketConstructor: FakeWebSocket as unknown as typeof WebSocket,
    ...options,
  });
}

function openWithHello(socket: FakeWebSocket): void {
  socket.emit('open');
  socket.sendHello({ experimental_userMessageResponses: true });
}

describe('createBridgeWebSocketConnect', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sockets.length = 0;
    scripts.length = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves once the socket is open and bridge-hello arrived', async () => {
    const onHello = vi.fn();
    scripts.push(openWithHello);

    const ws = await createConnect({ onHello })({
      abortSignal: new AbortController().signal,
      reason: 'open',
    });

    expect(ws).toBe(sockets[0]);
    expect(sockets[0].url).toBe(
      'wss://bridge.example/?agent_bridge_token=token',
    );
    expect(sockets[0].options).toEqual({
      headers: { 'x-access-token': 'traffic-token' },
    });
    expect(onHello).toHaveBeenCalledWith({
      type: 'bridge-hello',
      capabilities: { experimental_userMessageResponses: true },
    });
    expect(sockets[0].terminated).toBe(false);
    for (const listeners of sockets[0].listeners.values()) {
      expect(listeners.size).toBe(0);
    }
  });

  it('ignores messages that are not bridge-hello', async () => {
    let resolved = false;
    scripts.push(socket => {
      socket.emit('open');
      socket.emit('message', 'not json');
      socket.emit('message', JSON.stringify({ type: 'text-delta' }));
    });

    const connection = createConnect()({
      abortSignal: new AbortController().signal,
      reason: 'reconnect',
    }).then(ws => {
      resolved = true;
      return ws;
    });
    await vi.advanceTimersByTimeAsync(100);
    expect(resolved).toBe(false);

    sockets[0].sendHello();
    await expect(connection).resolves.toBe(sockets[0]);
  });

  it('rejects when bridge-hello does not arrive in time', async () => {
    scripts.push(socket => socket.emit('open'));

    const result = expect(
      createConnect()({
        abortSignal: new AbortController().signal,
        reason: 'reconnect',
      }),
    ).rejects.toThrow(
      'The harness bridge did not send bridge-hello within 5000ms.',
    );
    await vi.advanceTimersByTimeAsync(5_000);
    await result;
    expect(sockets[0].terminated).toBe(true);
  });

  it('rejects when the socket closes before bridge-hello', async () => {
    scripts.push(socket => {
      socket.emit('open');
      socket.emit('close', 1006);
    });

    await expect(
      createConnect()({
        abortSignal: new AbortController().signal,
        reason: 'reconnect',
      }),
    ).rejects.toThrow(
      'The harness bridge closed the WebSocket (code 1006) before sending bridge-hello.',
    );
    expect(sockets[0].terminated).toBe(true);
  });

  it('rejects when the socket does not open in time', async () => {
    scripts.push(socket => {
      socket.emitErrorOnTerminate = true;
    });

    const result = expect(
      createConnect()({
        abortSignal: new AbortController().signal,
        reason: 'reconnect',
      }),
    ).rejects.toThrow(
      'The harness bridge WebSocket did not open within 10000ms.',
    );
    await vi.advanceTimersByTimeAsync(10_000);
    await result;
    expect(sockets[0].terminated).toBe(true);
    expect(sockets[0].listeners.get('error')?.size).toBe(1);
  });

  it('rejects with the abort reason', async () => {
    const controller = new AbortController();
    scripts.push(() => controller.abort(new Error('stopped')));

    await expect(
      createConnect()({ abortSignal: controller.signal, reason: 'reconnect' }),
    ).rejects.toThrow('stopped');
    expect(sockets[0].terminated).toBe(true);
  });

  it('applies the start abort signal to the initial open only', async () => {
    const startController = new AbortController();
    const startAbortReason = new Error('start aborted');
    const connect = createConnect({
      startAbortSignal: startController.signal,
    });
    scripts.push(() => startController.abort(startAbortReason));

    await expect(
      connect({ abortSignal: new AbortController().signal, reason: 'open' }),
    ).rejects.toBe(startAbortReason);
    expect(sockets[0].terminated).toBe(true);

    scripts.push(openWithHello);
    await expect(
      connect({
        abortSignal: new AbortController().signal,
        reason: 'reconnect',
      }),
    ).resolves.toBe(sockets[1]);
  });

  it('retries the initial open until it succeeds', async () => {
    scripts.push(socket => socket.emit('error', new Error('502')));
    scripts.push(openWithHello);

    const connection = createConnect({ openRetryTimeoutMs: 20_000 })({
      abortSignal: new AbortController().signal,
      reason: 'open',
    });
    await vi.advanceTimersByTimeAsync(250);

    await expect(connection).resolves.toBe(sockets[1]);
    expect(sockets[0].terminated).toBe(true);
  });

  it('gives up retrying once the budget is used up', async () => {
    const socketError = new Error('connect ECONNREFUSED 10.0.0.1:4000');
    for (let i = 0; i < 10; i++) {
      scripts.push(socket => socket.emit('error', socketError));
    }

    const connection = createConnect({ openRetryTimeoutMs: 1_000 })({
      abortSignal: new AbortController().signal,
      reason: 'open',
    });
    const result = connection.catch(error => error);
    await vi.advanceTimersByTimeAsync(1_000);
    const error = await result;

    expect(HarnessError.isInstance(error)).toBe(true);
    expect(error.message).toMatchInlineSnapshot(
      `"The harness bridge did not complete the WebSocket handshake within 1000ms after 3 attempt(s)."`,
    );
    expect(error.message).not.toContain('10.0.0.1:4000');
    expect(error.cause).toBe(socketError);
  });

  it('does not retry when the bridge rejects the token', async () => {
    scripts.push(socket => {
      socket.emit('open');
      socket.emit('close', 1008);
    });

    await expect(
      createConnect({ openRetryTimeoutMs: 20_000 })({
        abortSignal: new AbortController().signal,
        reason: 'open',
      }),
    ).rejects.toThrow(
      'The harness bridge rejected the WebSocket connection as unauthorized (code 1008).',
    );
    expect(sockets).toHaveLength(1);
  });

  it('caps the hello timeout by the remaining retry budget', async () => {
    scripts.push(socket => socket.emit('open'));

    const connection = createConnect({ openRetryTimeoutMs: 3_000 })({
      abortSignal: new AbortController().signal,
      reason: 'open',
    });
    const result = connection.catch(error => error);
    await vi.advanceTimersByTimeAsync(3_000);
    const error = await result;

    expect(error.message).toMatchInlineSnapshot(
      `"The harness bridge did not complete the WebSocket handshake within 3000ms after 1 attempt(s)."`,
    );
    expect(error.cause).toEqual(
      new Error('The harness bridge did not send bridge-hello within 3000ms.'),
    );
    expect(sockets).toHaveLength(1);
  });

  it('makes a single attempt when reconnecting', async () => {
    scripts.push(socket => socket.emit('error', new Error('502')));

    await expect(
      createConnect({ openRetryTimeoutMs: 20_000 })({
        abortSignal: new AbortController().signal,
        reason: 'reconnect',
      }),
    ).rejects.toThrow('502');
    expect(sockets).toHaveLength(1);
  });

  it('calls onHello on every successful connect', async () => {
    const onHello = vi.fn();
    const connect = createConnect({ onHello });
    scripts.push(openWithHello);
    scripts.push(socket => {
      socket.emit('open');
      socket.sendHello();
    });

    await connect({
      abortSignal: new AbortController().signal,
      reason: 'open',
    });
    await connect({
      abortSignal: new AbortController().signal,
      reason: 'reconnect',
    });

    expect(onHello.mock.calls).toEqual([
      [
        {
          type: 'bridge-hello',
          capabilities: { experimental_userMessageResponses: true },
        },
      ],
      [{ type: 'bridge-hello' }],
    ]);
  });
});
