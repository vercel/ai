import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BrowserRealtimeTransport } from './browser-realtime-transport';
import {
  REALTIME_MAX_BUFFERED_BYTES,
  REALTIME_MAX_FRAME_BYTES,
} from './encode-realtime-frame';
import { deferred, flushEvents, liveModel } from './__fixtures__/fake-realtime';

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static instances: MockWebSocket[] = [];

  readyState = MockWebSocket.CONNECTING;
  bufferedAmount = 0;
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

  it.each([
    '',
    '/relative',
    'https://host.test',
    'wss://',
    'wss://[invalid',
    'wss://host.test/#fragment',
    'wss://host.test/#',
  ])('validates the final provider URL %s before allocating a socket', url => {
    const transport = new BrowserRealtimeTransport({
      model: { ...liveModel(), getWebSocketConfig: () => ({ url }) },
      onServerEvent: vi.fn(),
      onError: vi.fn(),
      onClose: vi.fn(),
    });
    expect(() =>
      transport.connect({
        mode: 'client-secret',
        token: 'token',
        url: 'wss://valid.test',
        onOpen: vi.fn(),
      }),
    ).toThrow('Invalid realtime WebSocket URL');
    expect(MockWebSocket.instances).toHaveLength(0);
    transport.dispose();
  });

  it.each([
    'ws://remote.test/path?key=ephemeral',
    'wss://remote.test/path?access_token=ephemeral',
  ])(
    'preserves native authentication queries and recognized URL syntax: %s',
    url => {
      const transport = new BrowserRealtimeTransport({
        model,
        onServerEvent: vi.fn(),
        onError: vi.fn(),
        onClose: vi.fn(),
      });
      transport.connect({
        mode: 'client-secret',
        token: 'token',
        url,
        onOpen: vi.fn(),
      });
      expect(MockWebSocket.instances[0].url).toBe(url);
      transport.dispose();
    },
  );

  it.each([
    {
      name: 'exact UTF-8 frame',
      data: 'é'.repeat(REALTIME_MAX_FRAME_BYTES / 2),
      buffered: 0,
      accepted: true,
    },
    {
      name: 'multibyte overflow',
      data: 'é'.repeat(REALTIME_MAX_FRAME_BYTES / 2) + 'a',
      buffered: 0,
      accepted: false,
    },
    {
      name: 'exact backlog',
      data: 'é',
      buffered: REALTIME_MAX_BUFFERED_BYTES - 2,
      accepted: true,
    },
    {
      name: 'crossing backlog',
      data: 'é',
      buffered: REALTIME_MAX_BUFFERED_BYTES - 1,
      accepted: false,
    },
    {
      name: 'oversized binary on empty backlog',
      data: new ArrayBuffer(REALTIME_MAX_FRAME_BYTES + 1),
      buffered: 0,
      accepted: false,
    },
    {
      name: 'sliced binary',
      data: new Uint8Array(
        new ArrayBuffer(REALTIME_MAX_FRAME_BYTES + 1),
        20,
        4,
      ),
      buffered: REALTIME_MAX_BUFFERED_BYTES - 4,
      accepted: true,
    },
    {
      name: 'sliced DataView',
      data: new DataView(new ArrayBuffer(REALTIME_MAX_FRAME_BYTES + 1), 10, 3),
      buffered: REALTIME_MAX_BUFFERED_BYTES - 2,
      accepted: false,
    },
    {
      name: 'exact Blob',
      data: new Blob([new Uint8Array(REALTIME_MAX_FRAME_BYTES)]),
      buffered: 0,
      accepted: true,
    },
    {
      name: 'oversized Blob',
      data: new Blob([new Uint8Array(REALTIME_MAX_FRAME_BYTES + 1)]),
      buffered: 0,
      accepted: false,
    },
  ])(
    'enforces actual wire bytes for $name',
    async ({ data, buffered, accepted }) => {
      const onError = vi.fn();
      const onFatalError = vi.fn();
      const transport = new BrowserRealtimeTransport({
        model: { ...liveModel(), serializeClientEvent: () => data },
        onServerEvent: vi.fn(),
        onError,
        onFatalError,
        onClose: vi.fn(),
      });
      transport.connect({
        mode: 'relay',
        url: 'wss://relay.test',
        onOpen: vi.fn(),
      });
      const ws = MockWebSocket.instances[0];
      ws.open();
      await flushEvents();
      ws.bufferedAmount = buffered;
      const sent = transport.sendEvent({ type: 'response-create' });
      if (accepted) {
        await sent;
        expect(ws.send).toHaveBeenCalledExactlyOnceWith(data);
        expect(onError).not.toHaveBeenCalled();
      } else {
        await expect(sent).rejects.toThrow(/limit/);
        expect(ws.send).not.toHaveBeenCalled();
        expect(onError).toHaveBeenCalledOnce();
      }
      expect(transport.isOpen).toBe(true);
      expect(onFatalError).not.toHaveBeenCalled();
      transport.dispose();
    },
  );

  it('stringifies once and handles ignored oversized operation promises without poisoning the queue', async () => {
    const toJSON = vi.fn(() => ({
      text: 'é'.repeat(REALTIME_MAX_FRAME_BYTES),
    }));
    const serialize = vi
      .fn()
      .mockReturnValueOnce({ toJSON })
      .mockReturnValueOnce({ ok: true })
      .mockReturnValue(null);
    const onError = vi.fn();
    const transport = new BrowserRealtimeTransport({
      model: { ...liveModel(), serializeClientEvent: serialize },
      onServerEvent: vi.fn(),
      onError,
      onClose: vi.fn(),
    });
    transport.connect({
      mode: 'relay',
      url: 'wss://relay.test',
      onOpen: vi.fn(),
    });
    const ws = MockWebSocket.instances[0];
    ws.open();
    await flushEvents();
    void transport.sendEvent({ type: 'response-create' });
    await transport.sendEvent({ type: 'response-create' });
    expect(toJSON).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledOnce();
    expect(ws.send).toHaveBeenCalledExactlyOnceWith('{"ok":true}');
    ws.bufferedAmount = REALTIME_MAX_BUFFERED_BYTES + 1;
    await transport.sendEvent({ type: 'response-create' });
    expect(ws.send).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledOnce();
    transport.dispose();
  });

  it('fences JSON toJSON reentry before sending bytes to either connection', async () => {
    const onError = vi.fn();
    const transport = new BrowserRealtimeTransport({
      model: {
        ...liveModel(),
        serializeClientEvent: () => ({
          toJSON() {
            transport.connect({
              mode: 'relay',
              url: 'wss://new.test',
              onOpen: vi.fn(),
            });
            MockWebSocket.instances[1].open();
            return { old: true };
          },
        }),
      },
      onServerEvent: vi.fn(),
      onError,
      onClose: vi.fn(),
    });
    transport.connect({
      mode: 'relay',
      url: 'wss://old.test',
      onOpen: vi.fn(),
    });
    MockWebSocket.instances[0].open();
    await expect(
      transport.sendEvent({ type: 'response-create' }),
    ).rejects.toThrow('closed');
    expect(MockWebSocket.instances).toHaveLength(2);
    expect(
      MockWebSocket.instances.every(ws => ws.send.mock.calls.length === 0),
    ).toBe(true);
    expect(transport.isOpen).toBe(true);
    expect(onError).not.toHaveBeenCalled();
    transport.dispose();
  });

  it('does not overwrite the replacement codec when parser construction reconnects', async () => {
    const createParser = vi.fn(() => {
      if (createParser.mock.calls.length === 1)
        transport.connect({
          mode: 'relay',
          url: 'wss://new.test',
          onOpen: vi.fn(),
        });
      return liveModel().parseServerEvent;
    });
    const onEvent = vi.fn();
    const transport = new BrowserRealtimeTransport({
      model: { ...liveModel(), createServerEventParser: createParser },
      onServerEvent: onEvent,
      onError: vi.fn(),
      onClose: vi.fn(),
    });
    transport.connect({
      mode: 'relay',
      url: 'wss://old.test',
      onOpen: vi.fn(),
    });
    expect(MockWebSocket.instances).toHaveLength(2);
    expect(MockWebSocket.instances[0].close).toHaveBeenCalledOnce();
    const replacement = MockWebSocket.instances[1];
    replacement.open();
    await transport.sendEvent({ type: 'response-create' });
    replacement.onmessage?.({
      data: '{"type":"session-created","sessionId":"new","raw":{}}',
    });
    await flushEvents();
    expect(onEvent).toHaveBeenCalledOnce();
    expect(replacement.send).toHaveBeenCalledExactlyOnceWith(
      '{"type":"response-create"}',
    );
    transport.dispose();
  });

  it('marks writes closed before onClosing and drains the accepted prefix exactly once', async () => {
    const delayed = deferred<string>();
    const blob = new Blob();
    vi.spyOn(blob, 'text').mockReturnValue(delayed.promise);
    const order: string[] = [];
    const onClosing = vi.fn(() => {
      order.push('closing');
      expect(transport.isOpen).toBe(false);
      expect(() => transport.sendEvent({ type: 'response-create' })).toThrow(
        'closed',
      );
    });
    const transport = new BrowserRealtimeTransport({
      model,
      onClosing,
      onServerEvent: () => {
        order.push('event');
      },
      onError: vi.fn(),
      onClose: () => {
        order.push('close');
      },
    });
    transport.connect({
      mode: 'relay',
      url: 'wss://relay.test',
      onOpen: vi.fn(),
    });
    const ws = MockWebSocket.instances[0];
    ws.open();
    ws.onmessage?.({ data: blob });
    ws.closeFromServer();
    ws.closeFromServer();
    expect(order).toEqual(['closing']);
    delayed.resolve('{"type":"session-created"}');
    await flushEvents();
    expect(order).toEqual(['closing', 'event', 'close']);
    expect(onClosing).toHaveBeenCalledOnce();
    transport.dispose();
  });

  it.each(['remote', 'fatal'] as const)(
    'does not let %s onClosing reconnect be torn down by the old drain',
    async kind => {
      vi.useFakeTimers();
      const onClose = vi.fn();
      const onFatalError = vi.fn();
      const onClosing = vi.fn(() => {
        transport.connect({
          mode: 'relay',
          url: 'wss://new.test',
          onOpen: vi.fn(),
        });
        MockWebSocket.instances[1].open();
      });
      const transport = new BrowserRealtimeTransport({
        model,
        onClosing,
        onServerEvent: vi.fn(),
        onError: vi.fn(),
        onFatalError,
        onClose,
      });
      transport.connect({
        mode: 'relay',
        url: 'wss://old.test',
        onOpen: vi.fn(),
      });
      const old = MockWebSocket.instances[0];
      old.open();
      if (kind === 'remote') old.closeFromServer();
      else old.onmessage?.({ data: '{' });
      await vi.advanceTimersByTimeAsync(2_000);
      expect(transport.isOpen).toBe(true);
      expect(MockWebSocket.instances[1].close).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
      expect(onFatalError).not.toHaveBeenCalled();
      expect(onClosing).toHaveBeenCalledOnce();
      transport.dispose();
    },
  );

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

  it.each(['dispose', 'client-secret', 'relay'] as const)(
    'does not allocate an old socket when provider configuration synchronously selects %s',
    async action => {
      const onOpen = vi.fn();
      const onReplacementOpen = vi.fn();
      const onServerEvent = vi.fn();
      const onError = vi.fn();
      const onClose = vi.fn();
      const getWebSocketConfig = vi.fn(
        ({ token, url }: { token: string; url?: string }) => {
          if (token === 'old-token') {
            if (action === 'dispose') transport.dispose();
            else
              transport.connect({
                ...(action === 'client-secret'
                  ? { mode: 'client-secret', token: 'new-token' }
                  : { mode: 'relay', protocols: ['app-protocol'] }),
                url: 'wss://replacement.test',
                onOpen: () => {
                  onReplacementOpen();
                  return transport.sendEvent({
                    type: 'session-update',
                    config: {},
                  });
                },
              });
          }
          return {
            url:
              token === 'old-token'
                ? 'invalid-retired-url'
                : (url ?? 'wss://provider.test'),
            protocols: [`provider-${token}`],
          };
        },
      );
      const transport = new BrowserRealtimeTransport({
        model: { ...liveModel(), getWebSocketConfig },
        onServerEvent,
        onError,
        onClose,
      });

      expect(() =>
        transport.connect({
          mode: 'client-secret',
          token: 'old-token',
          url: 'wss://retired.test',
          onOpen,
        }),
      ).not.toThrow();

      expect(onOpen).not.toHaveBeenCalled();
      expect(getWebSocketConfig).toHaveBeenCalledTimes(
        action === 'client-secret' ? 2 : 1,
      );
      expect(MockWebSocket.instances).toHaveLength(
        action === 'dispose' ? 0 : 1,
      );
      if (action === 'dispose') {
        expect(transport.isOpen).toBe(false);
      } else {
        const socket = MockWebSocket.instances[0];
        expect(socket.url).toBe('wss://replacement.test');
        expect(socket.protocols).toEqual([
          action === 'client-secret' ? 'provider-new-token' : 'app-protocol',
        ]);
        socket.open();
        await flushEvents();
        expect(transport.isOpen).toBe(true);
        expect(onReplacementOpen).toHaveBeenCalledOnce();
        expect(socket.send).toHaveBeenCalledExactlyOnceWith(
          JSON.stringify({ type: 'session-update', config: {} }),
        );
        const event = {
          type: 'session-created',
          sessionId: 'replacement',
          raw: {},
        };
        socket.onmessage?.({ data: JSON.stringify(event) });
        await flushEvents();
        expect(onServerEvent).toHaveBeenCalledExactlyOnceWith(event);
        expect(socket.close).not.toHaveBeenCalled();
        transport.dispose();
        expect(socket.close).toHaveBeenCalledOnce();
      }
      expect(onError).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
      expect(onOpen).not.toHaveBeenCalled();
    },
  );

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
