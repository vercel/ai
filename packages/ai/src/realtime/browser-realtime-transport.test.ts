import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BrowserRealtimeTransport } from './browser-realtime-transport';
import { deferred } from './__fixtures__/fake-realtime';

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static instances: MockWebSocket[] = [];

  readyState = MockWebSocket.CONNECTING;
  close = vi.fn(() => {
    this.readyState = 3;
  });
  send = vi.fn();
  onopen: (() => void) | null = null;
  onmessage: ((event: unknown) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;

  constructor(
    public url: string,
    public protocols?: string | string[],
  ) {
    MockWebSocket.instances.push(this);
  }

  open() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  closeFromServer({
    code = 1000,
    reason = '',
    wasClean = true,
  }: Partial<Pick<CloseEvent, 'code' | 'reason' | 'wasClean'>> = {}) {
    this.readyState = 3;
    this.onclose?.({ code, reason, wasClean } as CloseEvent);
  }
}

const model = {
  getWebSocketConfig: ({ url }: { url: string }) => ({ url }),
  serializeClientEvent: (event: unknown) => event,
  parseServerEvent: (raw: unknown) => raw,
} as never;

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe('BrowserRealtimeTransport', () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    vi.stubGlobal('WebSocket', MockWebSocket);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each([undefined, null, '', ' ', 123])(
    'rejects invalid client-secret token %s instead of selecting relay',
    token => {
      const transport = new BrowserRealtimeTransport({
        model,
        onServerEvent: vi.fn(),
        onError: vi.fn(),
        onClose: vi.fn(),
      });
      expect(() =>
        transport.connect({
          mode: 'client-secret',
          token,
          url: 'wss://example.com',
          onOpen: vi.fn(),
        } as never),
      ).toThrow('nonempty token');
      expect(MockWebSocket.instances).toHaveLength(0);
    },
  );

  it('requires callers without a token to explicitly select relay mode', () => {
    const transport = new BrowserRealtimeTransport({
      model,
      onServerEvent: vi.fn(),
      onError: vi.fn(),
      onClose: vi.fn(),
    });
    expect(() =>
      transport.connect({ url: 'wss://example.com', onOpen: vi.fn() } as never),
    ).toThrow('nonempty token');
    expect(MockWebSocket.instances).toHaveLength(0);
    transport.connect({
      mode: 'relay',
      url: 'wss://example.com',
      protocols: ['app'],
      onOpen: vi.fn(),
    });
    expect(MockWebSocket.instances[0].protocols).toEqual(['app']);
    transport.dispose();
  });

  it.each(['reject', 'timeout'] as const)(
    'settles a %s drain once despite throwing error and close callbacks',
    async outcome => {
      vi.useFakeTimers();
      const pending = deferred<void>();
      const onError = vi.fn((_error: Error) => {
        throw new Error('error callback failed');
      });
      const onClose = vi.fn(() => {
        throw new Error('close callback failed');
      });
      const transport = new BrowserRealtimeTransport({
        model,
        onServerEvent: vi.fn(),
        onError,
        onClose,
      });
      const finish = vi.spyOn(transport, 'finish');
      if (outcome === 'reject')
        finish.mockRejectedValue(new Error('drain failed'));
      else finish.mockReturnValue(pending.promise);
      transport.connect({
        mode: 'client-secret',
        token: 'token',
        url: 'wss://example.com',
        onOpen: vi.fn(),
      });
      const socket = MockWebSocket.instances[0];
      socket.open();
      expect(() => socket.onmessage?.({ data: '{' })).not.toThrow();
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(1_001);
      pending.resolve();
      await vi.advanceTimersByTimeAsync(1_001);
      expect(socket.close).toHaveBeenCalledOnce();
      expect(onClose).toHaveBeenCalledOnce();
      expect(onError.mock.calls.map(([error]) => error.message)).toEqual([
        'Invalid JSON in realtime server message',
        'close callback failed',
      ]);
      transport.dispose();
    },
  );

  it('closes a socket that is still connecting on disconnect', () => {
    const transport = new BrowserRealtimeTransport({
      model,
      onServerEvent: vi.fn(),
      onError: vi.fn(),
      onClose: vi.fn(),
    });

    const onOpen = vi.fn();
    transport.connect({
      mode: 'client-secret',
      token: 'token',
      url: 'wss://example.com',
      onOpen,
    });

    const ws = MockWebSocket.instances[0];
    expect(ws.readyState).toBe(MockWebSocket.CONNECTING);

    // Disconnect before the socket finishes connecting.
    transport.disconnect();
    expect(ws.close).toHaveBeenCalledOnce();

    // A late open for the now-disconnected socket must not fire onOpen
    // (which would send session-update against a disconnected session).
    ws.open();
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('fires onOpen when the socket opens normally', () => {
    const transport = new BrowserRealtimeTransport({
      model,
      onServerEvent: vi.fn(),
      onError: vi.fn(),
      onClose: vi.fn(),
    });

    const onOpen = vi.fn();
    transport.connect({
      mode: 'client-secret',
      token: 'token',
      url: 'wss://example.com',
      onOpen,
    });

    MockWebSocket.instances[0].open();
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it('closes an existing socket before reconnecting', async () => {
    const onClose = vi.fn();
    const transport = new BrowserRealtimeTransport({
      model,
      onServerEvent: vi.fn(),
      onError: vi.fn(),
      onClose,
    });

    transport.connect({
      mode: 'client-secret',
      token: 'token-1',
      url: 'wss://example.com/one',
      onOpen: vi.fn(),
    });
    const firstSocket = MockWebSocket.instances[0];

    transport.connect({
      mode: 'client-secret',
      token: 'token-2',
      url: 'wss://example.com/two',
      onOpen: vi.fn(),
    });
    const secondSocket = MockWebSocket.instances[1];

    expect(firstSocket.close).toHaveBeenCalledOnce();

    firstSocket.closeFromServer();
    expect(onClose).not.toHaveBeenCalled();

    secondSocket.closeFromServer();
    await flush();
    expect(onClose).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledWith(undefined);
  });

  it('preserves an abnormal server close as an error', async () => {
    const onClose = vi.fn();
    const transport = new BrowserRealtimeTransport({
      model,
      onServerEvent: vi.fn(),
      onError: vi.fn(),
      onClose,
    });

    transport.connect({
      mode: 'client-secret',
      token: 'token',
      url: 'wss://example.com',
      onOpen: vi.fn(),
    });
    const socket = MockWebSocket.instances[0];
    socket.open();
    socket.closeFromServer({
      code: 1011,
      reason: 'upstream unavailable',
      wasClean: true,
    });

    await flush();

    expect(onClose).toHaveBeenCalledExactlyOnceWith(
      new Error(
        'Realtime WebSocket closed unexpectedly (code 1011: upstream unavailable)',
      ),
    );
  });

  it('preserves close details when an error precedes an unclean close', async () => {
    const onClose = vi.fn();
    const onFatalError = vi.fn();
    const transport = new BrowserRealtimeTransport({
      model,
      onServerEvent: vi.fn(),
      onError: vi.fn(),
      onFatalError,
      onClose,
    });

    transport.connect({
      mode: 'client-secret',
      token: 'token',
      url: 'wss://example.com',
      onOpen: vi.fn(),
    });
    const socket = MockWebSocket.instances[0];
    socket.open();
    socket.onerror?.();

    expect(socket.close).not.toHaveBeenCalled();
    expect(onFatalError).not.toHaveBeenCalled();

    socket.closeFromServer({ code: 1006, wasClean: false });
    await flush();

    expect(onClose).toHaveBeenCalledExactlyOnceWith(
      new Error('Realtime WebSocket closed unexpectedly (code 1006)'),
    );
  });

  it('preserves send order when serialization is async', async () => {
    let resolveFirst: (() => void) | undefined;
    const asyncModel = {
      getWebSocketConfig: ({ url }: { url: string }) => ({ url }),
      serializeClientEvent: (event: { type: string }) => {
        if (event.type === 'first') {
          return new Promise(resolve => {
            resolveFirst = () => resolve({ type: 'first' });
          });
        }
        return event;
      },
      parseServerEvent: (raw: unknown) => raw,
    } as never;

    const transport = new BrowserRealtimeTransport({
      model: asyncModel,
      onServerEvent: vi.fn(),
      onError: vi.fn(),
      onClose: vi.fn(),
    });

    transport.connect({
      mode: 'client-secret',
      token: 'token',
      url: 'wss://example.com',
      onOpen: vi.fn(),
    });
    const ws = MockWebSocket.instances[0];
    ws.open();

    transport.sendEvent({ type: 'first' } as never);
    transport.sendEvent({ type: 'second' } as never);

    await flush();
    expect(ws.send).not.toHaveBeenCalled();

    resolveFirst?.();
    await flush();

    expect(ws.send).toHaveBeenNthCalledWith(
      1,
      JSON.stringify({ type: 'first' }),
    );
    expect(ws.send).toHaveBeenNthCalledWith(
      2,
      JSON.stringify({ type: 'second' }),
    );
  });

  it('sends serialized strings and binary data without JSON encoding', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const rawModel = {
      getWebSocketConfig: ({ url }: { url: string }) => ({ url }),
      serializeClientEvent: (event: { type: string }) =>
        event.type === 'binary' ? bytes : 'finalize',
      parseServerEvent: (raw: unknown) => raw,
    } as never;
    const transport = new BrowserRealtimeTransport({
      model: rawModel,
      onServerEvent: vi.fn(),
      onError: vi.fn(),
      onClose: vi.fn(),
    });

    transport.connect({
      mode: 'client-secret',
      token: 'token',
      url: 'wss://example.com',
      onOpen: vi.fn(),
    });
    const ws = MockWebSocket.instances[0];
    ws.open();

    transport.sendEvent({ type: 'text' } as never);
    transport.sendEvent({ type: 'binary' } as never);
    await flush();

    expect(ws.send).toHaveBeenNthCalledWith(1, 'finalize');
    expect(ws.send).toHaveBeenNthCalledWith(2, bytes);
  });
});
