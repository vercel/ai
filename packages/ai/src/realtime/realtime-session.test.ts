import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { RealtimeModel } from '../types/realtime-model';

// Capture transport instances created lazily by connect().
const sentEvents: Array<{ type: string; [key: string]: unknown }> = [];
const transportInstances: Array<{
  connect: ReturnType<typeof vi.fn>;
  emitServerEvent: (event: unknown) => Promise<void> | void;
  emitClose: (error?: Error) => void;
}> = [];

vi.mock('./browser-realtime-transport', () => ({
  BrowserRealtimeTransport: class {
    private readonly options: {
      onServerEvent: (event: unknown) => Promise<void> | void;
      onClose: (error?: Error) => void;
    };
    constructor(options: {
      onServerEvent: (event: unknown) => Promise<void> | void;
      onClose: (error?: Error) => void;
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
      return Promise.resolve();
    };
    emitServerEvent(event: unknown) {
      return this.options.onServerEvent(event);
    }
    emitClose(error?: Error) {
      this.options.onClose(error);
    }
  },
}));

vi.mock('./browser-realtime-audio', () => ({
  BrowserRealtimeAudio: class {
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

  get messages() {
    return this.state.messages;
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

const functionCallDelta = (callId: string) => ({
  type: 'function-call-arguments-delta',
  responseId: 'resp-1',
  itemId: `item-${callId}`,
  callId,
  delta: '{}',
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
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({ token: 'secret', url: 'wss://example.com/realtime' }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(['websocket', 'webrtc'] as const)(
    'rejects incompatible %s connection capabilities before requesting a token',
    async transport => {
      const fetch = vi.spyOn(globalThis, 'fetch');
      const model = createModel({
        conversation: 'continuous',
        transports: [transport],
        connections: [transport === 'webrtc' ? 'webrtc' : 'server-websocket'],
      });

      const onError = vi.fn();
      await new TestSession({
        model,
        api: { token: '/api/token' },
        onError,
      }).connect();
      expect(onError).toHaveBeenCalledWith(
        new Error('Realtime model does not support client-secret-websocket'),
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
        mode: 'client-secret',
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

  it('reports an abnormal close after a legacy session becomes ready', async () => {
    const onError = vi.fn();
    const session = new TestSession({
      model: createModel(),
      api: { token: '/api/token' },
      onError,
    });

    await session.connect();
    const transport = transportInstances[0];
    await transport.emitServerEvent({
      type: 'session-created',
      sessionId: 'session',
      raw: {},
    });
    transport.emitClose(
      new Error('Realtime WebSocket closed unexpectedly (code 1011)'),
    );
    await flush();

    expect(onError).toHaveBeenCalledExactlyOnceWith(
      new Error('Realtime WebSocket closed unexpectedly (code 1011)'),
    );
  });

  it('does not error when onToolCall returns undefined (manual flow)', async () => {
    const onError = vi.fn();
    const session = new TestSession({
      model: createModel(),
      api: { token: 'token' },
      onToolCall: async () => undefined,
      onError,
    });
    await session.connect();

    const transport = transportInstances.at(-1)!;
    await transport.emitServerEvent(functionCallDone('call-1', 'getWeather'));
    await flush();

    // Returning undefined is the documented "submit later" pattern and must not
    // be treated as a missing handler.
    expect(onError).not.toHaveBeenCalled();
  });

  it('errors when no onToolCall handler is provided', async () => {
    const onError = vi.fn();
    const session = new TestSession({
      model: createModel(),
      api: { token: 'token' },
      onError,
    });
    await session.connect();

    const transport = transportInstances.at(-1)!;
    await transport.emitServerEvent(functionCallDone('call-1', 'getWeather'));
    await flush();

    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0][0].message).toContain(
      'No handler provided for tool',
    );
  });

  it.each(['synchronously', 'asynchronously'] as const)(
    'records tool execution that fails %s as output-error',
    async mode => {
      const errorText = `${mode} failed`;
      const onError = vi.fn();
      const session = new TestSession({
        model: createModel(),
        api: { token: 'token' },
        onToolCall:
          mode === 'synchronously'
            ? () => {
                throw new Error(errorText);
              }
            : async () => {
                throw new Error(errorText);
              },
        onError,
      });
      await session.connect();

      const transport = transportInstances.at(-1)!;
      await transport.emitServerEvent({
        type: 'session-created',
        sessionId: 'session',
        raw: {},
      });
      await transport.emitServerEvent(functionCallDelta('call-1'));
      await transport.emitServerEvent(functionCallDone('call-1', 'getWeather'));
      await flush();

      expect(onError).toHaveBeenCalledExactlyOnceWith(new Error(errorText));
      expect(session.messages[0].parts).toEqual([
        {
          type: 'dynamic-tool',
          toolName: 'getWeather',
          toolCallId: 'call-1',
          state: 'output-error',
          input: {},
          errorText,
        },
      ]);

      session.addToolOutput('call-1', { temperature: 22 });

      expect(session.messages[0].parts).toEqual([
        {
          type: 'dynamic-tool',
          toolName: 'getWeather',
          toolCallId: 'call-1',
          state: 'output-available',
          input: {},
          output: { temperature: 22 },
        },
      ]);
    },
  );

  it('ignores a tool rejection from a previous connection attempt', async () => {
    let rejectTool!: (error: Error) => void;
    const toolResult = new Promise<never>((_resolve, reject) => {
      rejectTool = reject;
    });
    const onError = vi.fn();
    const session = new TestSession({
      model: createModel({
        conversation: 'turn-based',
        transports: ['websocket'],
        connections: ['server-websocket'],
      }),
      api: { websocket: 'wss://example.com/realtime' },
      onToolCall: () => toolResult,
      onError,
    });
    await session.connect();

    const firstTransport = transportInstances.at(-1)!;
    await firstTransport.emitServerEvent({
      type: 'session-created',
      sessionId: 'first-session',
      raw: {},
    });
    await firstTransport.emitServerEvent(functionCallDelta('call-1'));
    await firstTransport.emitServerEvent(
      functionCallDone('call-1', 'getWeather'),
    );

    session.disconnect();
    await session.connect();
    const secondTransport = transportInstances.at(-1)!;
    await secondTransport.emitServerEvent({
      type: 'session-created',
      sessionId: 'second-session',
      raw: {},
    });
    const messagesBeforeRejection = structuredClone(session.messages);

    rejectTool(new Error('stale failure'));
    await flush();

    expect(session.messages).toEqual(messagesBeforeRejection);
    expect(onError).not.toHaveBeenCalled();
  });

  it('requests a single response after all tool outputs are submitted', async () => {
    const session = new TestSession({
      model: createModel(),
      api: { token: 'token' },
      onToolCall: async () => ({ ok: true }),
    });
    await session.connect();

    const transport = transportInstances.at(-1)!;
    await transport.emitServerEvent({
      type: 'session-created',
      sessionId: 'session',
      raw: {},
    });
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
    const session = new TestSession({
      model: createModel(),
      api: { token: 'token' },
      onToolCall: async () => ({ ok: true }),
    });
    await session.connect();

    const transport = transportInstances.at(-1)!;
    await transport.emitServerEvent({
      type: 'session-created',
      sessionId: 'session',
      raw: {},
    });
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
