import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { RealtimeModel } from '../types/realtime-model';

// Capture transport instances and outgoing events. The transport is created
// inside the session constructor, so we replace it with a controllable fake
// that lets the test feed server events and observe sent client events.
const sentEvents: Array<{ type: string; [key: string]: unknown }> = [];
const transportInstances: Array<{
  connect: ReturnType<typeof vi.fn>;
  emitServerEvent: (event: unknown) => Promise<void> | void;
}> = [];

vi.mock('./browser-realtime-transport', () => ({
  BrowserRealtimeTransport: class {
    private readonly options: {
      onServerEvent: (event: unknown) => Promise<void> | void;
    };
    constructor(options: {
      onServerEvent: (event: unknown) => Promise<void> | void;
    }) {
      this.options = options;
      transportInstances.push(this);
    }
    connect = vi.fn();
    disconnect = vi.fn();
    dispose = vi.fn();
    sendRaw = vi.fn();
    sendEvent = (event: { type: string }) => {
      sentEvents.push(event);
    };
    emitServerEvent(event: unknown) {
      return this.options.onServerEvent(event);
    }
  },
}));

vi.mock('./browser-realtime-audio', () => ({
  BrowserRealtimeAudio: class {
    constructor(_options: unknown) {}
    ensurePlaybackContext = vi.fn();
    startCapture = vi.fn();
    stopCapture = vi.fn();
    stopPlayback = vi.fn();
    playAudio = vi.fn();
    getPlaybackOffsetMs = vi.fn(() => 0);
    dispose = vi.fn();
  },
}));

const { AbstractRealtimeSession } = await import('./realtime-session');

class TestSession extends AbstractRealtimeSession {
  protected setState(): void {
    // no-op for tests
  }
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

const functionCallDone = (callId: string, name: string) => ({
  type: 'function-call-arguments-done',
  responseId: 'resp-1',
  itemId: `item-${callId}`,
  callId,
  name,
  arguments: '{}',
  raw: {},
});

const responseDone = () => ({
  type: 'response-done',
  responseId: 'resp-1',
  status: 'completed',
  raw: {},
});

function createModel(
  capabilities?: RealtimeModel['capabilities'],
): RealtimeModel {
  return {
    specificationVersion: 'v4',
    provider: 'test',
    modelId: 'test',
    capabilities,
    doCreateClientSecret: vi.fn(),
    getWebSocketConfig: vi.fn(),
    parseServerEvent: vi.fn(),
    serializeClientEvent: vi.fn(),
    buildSessionConfig: vi.fn(),
  };
}

describe('AbstractRealtimeSession', () => {
  beforeEach(() => {
    sentEvents.length = 0;
    transportInstances.length = 0;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(['websocket', 'webrtc'] as const)(
    'requires a session endpoint for continuous %s models without requesting a token',
    async transport => {
      const fetch = vi.spyOn(globalThis, 'fetch');
      const model = createModel({
        conversation: 'continuous',
        transports: [transport],
      });

      const onError = vi.fn();
      await new TestSession({
        model,
        api: { token: '/api/token' },
        onError,
      }).connect();
      expect(onError).toHaveBeenCalledWith(
        new Error(
          'Continuous realtime models require api.websocket or api.session',
        ),
      );
      expect(fetch).not.toHaveBeenCalled();
      expect(model.doCreateClientSecret).not.toHaveBeenCalled();
      expect(model.getWebSocketConfig).not.toHaveBeenCalled();
      expect(sentEvents).toHaveLength(0);
    },
  );

  it.each([undefined, 'turn-based'] as const)(
    'preserves the token connection flow with %s conversation capabilities',
    async conversation => {
      const fetch = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(
          Response.json({ token: 'secret', url: 'wss://example.com/realtime' }),
        );
      const onError = vi.fn();
      const session = new TestSession({
        model: createModel(
          conversation === undefined
            ? undefined
            : { conversation, transports: ['websocket'] },
        ),
        api: { token: '/api/token' },
        sessionConfig: { instructions: 'Be concise.' },
        onError,
      });

      await session.connect();

      expect(onError).not.toHaveBeenCalled();
      expect(fetch).toHaveBeenCalledExactlyOnceWith('/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionConfig: { instructions: 'Be concise.' },
        }),
        signal: expect.any(AbortSignal),
      });
      expect(transportInstances[0].connect).toHaveBeenCalledExactlyOnceWith({
        token: 'secret',
        url: 'wss://example.com/realtime',
        onOpen: expect.any(Function),
      });
      transportInstances[0].connect.mock.calls[0][0].onOpen();
      session.sendTextMessage('Hello');
      expect(sentEvents).toEqual([
        { type: 'session-update', config: { instructions: 'Be concise.' } },
        {
          type: 'conversation-item-create',
          item: { type: 'text-message', role: 'user', text: 'Hello' },
        },
        { type: 'response-create' },
      ]);
    },
  );

  it('does not error when onToolCall returns undefined (manual flow)', async () => {
    const onError = vi.fn();
    new TestSession({
      model: {} as never,
      api: { token: 'token' },
      onToolCall: async () => undefined,
      onError,
    });

    const transport = transportInstances.at(-1)!;
    await transport.emitServerEvent(functionCallDone('call-1', 'getWeather'));
    await flush();

    // Returning undefined is the documented "submit later" pattern and must not
    // be treated as a missing handler.
    expect(onError).not.toHaveBeenCalled();
  });

  it('errors when no onToolCall handler is provided', async () => {
    const onError = vi.fn();
    new TestSession({ model: {} as never, api: { token: 'token' }, onError });

    const transport = transportInstances.at(-1)!;
    await transport.emitServerEvent(functionCallDone('call-1', 'getWeather'));
    await flush();

    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0][0].message).toContain(
      'No handler provided for tool',
    );
  });

  it('requests a single response after all tool outputs are submitted', async () => {
    new TestSession({
      model: {} as never,
      api: { token: 'token' },
      onToolCall: async () => ({ ok: true }),
    });

    const transport = transportInstances.at(-1)!;
    await transport.emitServerEvent(functionCallDone('call-1', 'a'));
    await transport.emitServerEvent(functionCallDone('call-2', 'b'));
    await transport.emitServerEvent(responseDone());
    await flush();

    const responseCreates = sentEvents.filter(
      e => e.type === 'response-create',
    );
    expect(responseCreates).toHaveLength(1);

    const outputs = sentEvents.filter(
      e =>
        e.type === 'conversation-item-create' &&
        (e.item as { type?: string })?.type === 'function-call-output',
    );
    expect(outputs).toHaveLength(2);
  });

  it('does not request a response before the tool-bearing response is done', async () => {
    new TestSession({
      model: {} as never,
      api: { token: 'token' },
      onToolCall: async () => ({ ok: true }),
    });

    const transport = transportInstances.at(-1)!;
    // Output submitted before response-done arrives.
    await transport.emitServerEvent(functionCallDone('call-1', 'a'));
    await flush();
    expect(sentEvents.filter(e => e.type === 'response-create')).toHaveLength(
      0,
    );

    await transport.emitServerEvent(responseDone());
    await flush();
    expect(sentEvents.filter(e => e.type === 'response-create')).toHaveLength(
      1,
    );
  });
});
