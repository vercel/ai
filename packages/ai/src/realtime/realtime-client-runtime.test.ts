import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AbstractRealtimeSession,
  type RealtimeSessionOptions,
  type RealtimeState,
} from './realtime-session';
import { deferred, flushEvents, liveModel } from './__fixtures__/fake-realtime';
import {
  FakeAudioContext,
  FakeWebSocket,
  installLiveWebSocket,
} from './__fixtures__/fake-live-websocket';
import { encodeRealtimeAudio } from './audio-utils';
import type { RealtimeServerEvent } from '../types/realtime-model';

class Session extends AbstractRealtimeSession {
  onPublish?: (key: keyof RealtimeState) => void;
  get snapshot() {
    return this.state;
  }
  protected setState<K extends keyof RealtimeState>(
    key: K,
    value: RealtimeState[K],
  ) {
    this.state = { ...this.state, [key]: value };
    this.onPublish?.(key);
  }
}

const legacyModel = () => ({
  ...liveModel(),
  capabilities: undefined,
  getWebSocketConfig: vi.fn(({ url }: { url: string }) => ({ url })),
});
const toolDone: RealtimeServerEvent = {
  type: 'function-call-arguments-done',
  responseId: 'response',
  itemId: 'tool',
  callId: 'call',
  name: 'lookup',
  arguments: '{}',
  raw: {},
};
const terminal: RealtimeServerEvent = {
  type: 'session-closed',
  usage: { seconds: 12.345 },
  reason: 'requested',
  raw: {},
};

describe('client-delegation runtime correctness', () => {
  let browser: ReturnType<typeof installLiveWebSocket>;
  const sessions: Session[] = [];
  const create = (options: Partial<RealtimeSessionOptions> = {}) => {
    const session = new Session({
      model: liveModel(),
      api: { websocket: 'wss://relay.test' },
      ...options,
    });
    sessions.push(session);
    return session;
  };
  const socket = () => FakeWebSocket.instances.at(-1)!;
  const emit = async (event: RealtimeServerEvent) => {
    socket().emit(event);
    await flushEvents();
  };
  const ready = async (session: Session, legacy = false) => {
    await session.connect({ capture: false });
    socket().open();
    await emit(
      legacy
        ? { type: 'session-created', sessionId: 'legacy', raw: {} }
        : {
            type: 'session-started',
            sessionId: 'client',
            delegationMode: 'client',
            raw: {},
          },
    );
  };
  beforeEach(() => {
    browser = installLiveWebSocket();
    browser.fetch.mockImplementation(async () =>
      Response.json({ token: 'secret', url: 'wss://provider.test' }),
    );
  });
  afterEach(() => {
    sessions.forEach(session => {
      session.onPublish = undefined;
      session.dispose();
    });
    sessions.length = 0;
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each(['status', 'session'] as const)(
    'retires startup during the first %s publication without allocating resources',
    async key => {
      vi.useFakeTimers();
      const session = create();
      session.onPublish = published => {
        if (published !== key) return;
        session.onPublish = undefined;
        session.disconnect();
      };
      await session.connect();
      expect(session.snapshot.status).toBe('disconnected');
      expect(FakeWebSocket.instances).toHaveLength(0);
      expect(FakeAudioContext.instances).toHaveLength(0);
      expect(browser.getUserMedia).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it.each(['status', 'session'] as const)(
    'does not overwrite replacement resources after a reentrant %s startup publication',
    async key => {
      vi.useFakeTimers();
      const onError = vi.fn();
      const session = create({ startupTimeoutMs: 50, onError });
      let replacement: Promise<void> | undefined;
      session.onPublish = published => {
        if (published !== key) return;
        session.onPublish = undefined;
        session.disconnect();
        replacement = session.connect({ capture: false });
      };
      await session.connect();
      await replacement;
      expect(FakeWebSocket.instances).toHaveLength(1);
      expect(FakeAudioContext.instances).toHaveLength(1);
      expect(vi.getTimerCount()).toBe(1);
      socket().open();
      await emit({
        type: 'session-started',
        sessionId: 'replacement',
        raw: {},
      });
      await vi.advanceTimersByTimeAsync(51);
      expect(session.snapshot.status).toBe('connected');
      expect(session.snapshot.session?.sessionId).toBe('replacement');
      await session.sendEvent({
        type: 'context-append',
        delegationId: null,
        content: 'works',
      });
      expect(socket().sent.at(-1)?.type).toBe('context-append');
      expect(socket().close).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
      expect(browser.getUserMedia).not.toHaveBeenCalled();
      session.disconnect();
      expect(socket().close).toHaveBeenCalledOnce();
      expect(FakeAudioContext.instances[0].close).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('detaches retired resources before abort listeners can reconnect', async () => {
    const session = create({ model: legacyModel(), api: { token: '/token' } });
    await ready(session, true);
    const old = socket();
    let replacement: Promise<void> | undefined;
    browser.fetch.mock.calls[0][1]?.signal?.addEventListener('abort', () => {
      replacement = session.connect();
    });
    session.disconnect();
    await replacement;
    expect(old.close).toHaveBeenCalledOnce();
    expect(socket()).not.toBe(old);
    expect(socket().close).not.toHaveBeenCalled();
    socket().open();
    await emit({ type: 'session-created', sessionId: 'new', raw: {} });
    session.sendTextMessage('new attempt');
    await flushEvents();
    expect(socket().sent.at(-1)?.type).toBe('response-create');
    expect(session.snapshot.status).toBe('connected');
  });

  it('does not start capture or notify readiness after a connected subscriber disconnects', async () => {
    const onEvent = vi.fn();
    const session = create({ onEvent });
    await session.connect();
    socket().open();
    session.onPublish = key => {
      if (key === 'status' && session.snapshot.status === 'connected')
        session.disconnect();
    };
    await emit({ type: 'session-started', sessionId: 'old', raw: {} });
    expect(browser.getUserMedia).not.toHaveBeenCalled();
    expect(session.snapshot.status).toBe('disconnected');
    expect(onEvent).not.toHaveBeenCalled();
  });

  it('does not arm an old close deadline or send close through a subscriber replacement', async () => {
    vi.useFakeTimers();
    const session = create({ closeTimeoutMs: 20 });
    await ready(session);
    const old = socket();
    let replacement: Promise<void> | undefined;
    session.onPublish = key => {
      if (key !== 'status' || session.snapshot.status !== 'closing') return;
      session.onPublish = undefined;
      session.disconnect();
      replacement = session.connect({ capture: false });
    };
    await session.close();
    await replacement;
    socket().open();
    await emit({ type: 'session-started', sessionId: 'new', raw: {} });
    await vi.advanceTimersByTimeAsync(21);
    expect(session.snapshot.status).toBe('connected');
    expect(socket().sent.map(event => event.type)).toEqual(['session-start']);
    expect(old.sent.map(event => event.type)).toEqual(['session-start']);
    expect(socket().close).not.toHaveBeenCalled();
  });

  it('ignores a late onEvent rejection from a retired attempt', async () => {
    const callback = deferred<void>();
    const onError = vi.fn();
    const session = create({
      onError,
      onEvent: async event => {
        if (event.type === 'session-usage') {
          await callback.promise;
          throw new Error('old callback');
        }
      },
    });
    await ready(session);
    await emit({ type: 'session-usage', usage: { seconds: 1 }, raw: {} });
    session.disconnect();
    await ready(session);
    callback.resolve();
    await flushEvents();
    expect(onError).not.toHaveBeenCalled();
    expect(session.snapshot.status).toBe('connected');
  });

  it.each(['throw', 'reject'] as const)(
    'reports a current onEvent %s recoverably',
    async kind => {
      const onError = vi.fn();
      const error = new Error('application callback');
      const session = create({
        onError,
        onEvent: () => {
          if (kind === 'throw') throw error;
          return Promise.reject(error);
        },
      });
      await ready(session);
      expect(onError).toHaveBeenCalledExactlyOnceWith(error);
      expect(session.snapshot.status).toBe('connected');
    },
  );

  it('delivers final session.closed once after intentional retirement with exact duration', async () => {
    const onEvent = vi.fn();
    const session = create({ onEvent });
    await ready(session);
    onEvent.mockClear();
    const closed = session.close();
    socket().emit(terminal);
    socket().emit(terminal);
    await closed;
    await flushEvents();
    expect(onEvent).toHaveBeenCalledExactlyOnceWith(terminal);
    expect(session.snapshot.session?.usage).toEqual({ seconds: 12.345 });
    expect(session.snapshot.session?.finalization).toBe('confirmed');
  });

  it('does not notify an old error after onError synchronously reconnects', async () => {
    const onEvent = vi.fn();
    const session = create({ onEvent });
    await ready(session);
    onEvent.mockClear();
    session.onError = () => {
      session.disconnect();
      void session.connect({ capture: false });
    };
    await emit({ type: 'error', message: 'old', raw: {} });
    expect(onEvent).not.toHaveBeenCalled();
    expect(session.snapshot.status).toBe('connecting');
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it('does not run a legacy tool or notify its old event after publication reconnects', async () => {
    const onToolCall = vi.fn(() => 'result');
    const onEvent = vi.fn();
    const session = create({
      model: legacyModel(),
      api: { token: '/token' },
      onToolCall,
      onEvent,
    });
    await ready(session, true);
    onEvent.mockClear();
    session.onPublish = key => {
      if (key !== 'events') return;
      session.onPublish = undefined;
      session.disconnect();
      void session.connect();
    };
    await emit(toolDone);
    expect(onToolCall).not.toHaveBeenCalled();
    expect(onEvent).not.toHaveBeenCalled();
    expect(socket().sent).toEqual([]);
  });

  it.each(['result', 'error'] as const)(
    'ignores a legacy tool %s completing after reconnect',
    async outcome => {
      const tool = deferred<void>();
      const onError = vi.fn();
      const session = create({
        model: legacyModel(),
        api: { token: '/token' },
        onError,
        onToolCall: async () => {
          await tool.promise;
          if (outcome === 'error') throw new Error('old tool');
          return 'old output';
        },
      });
      await ready(session, true);
      await emit(toolDone);
      session.disconnect();
      await ready(session, true);
      tool.resolve();
      await flushEvents();
      expect(socket().sent.map(event => event.type)).toEqual([
        'session-update',
      ]);
      expect(onError).not.toHaveBeenCalled();
    },
  );

  it('fences automatic legacy output when publishing that output reconnects', async () => {
    const result = deferred<string>();
    const session = create({
      model: legacyModel(),
      api: { token: '/token' },
      onToolCall: () => result.promise,
    });
    await ready(session, true);
    await emit({
      type: 'function-call-arguments-delta',
      responseId: 'response',
      itemId: 'tool',
      callId: 'call',
      delta: '{}',
      raw: {},
    });
    await emit(toolDone);
    session.onPublish = key => {
      if (key !== 'messages') return;
      session.onPublish = undefined;
      session.disconnect();
      void session.connect();
    };
    result.resolve('output');
    await flushEvents();
    socket().open();
    await emit({ type: 'session-created', sessionId: 'new', raw: {} });
    expect(socket().sent.map(event => event.type)).toEqual(['session-update']);
  });

  it.each(['play', 'barge-in'] as const)(
    'fences notification and truncation when a legacy %s publication reconnects',
    async phase => {
      const onEvent = vi.fn();
      const onError = vi.fn();
      const session = create({
        model: legacyModel(),
        api: { token: '/token' },
        onEvent,
        onError,
      });
      await ready(session, true);
      const old = socket();
      const playback = FakeAudioContext.instances[0];
      playback.state = 'running';
      const audio: RealtimeServerEvent = {
        type: 'audio-delta',
        responseId: 'r',
        itemId: 'i',
        delta: encodeRealtimeAudio(new Float32Array(240)),
        raw: {},
      };
      if (phase === 'barge-in') await emit(audio);
      onEvent.mockClear();
      session.onPublish = key => {
        if (key !== 'isPlaying') return;
        session.onPublish = undefined;
        session.disconnect();
        void session.connect();
      };
      await emit(
        phase === 'play' ? audio : { type: 'speech-started', raw: {} },
      );
      expect(onEvent).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
      expect(playback.close).toHaveBeenCalledOnce();
      expect(old.sent.map(event => event.type)).toEqual(['session-update']);
      expect(socket().sent).toEqual([]);
      expect(session.snapshot.status).toBe('connecting');
    },
  );

  it.each(['legacy', 'continuous'] as const)(
    'does not reacquire %s capture after a stop publication retires it',
    async profile => {
      const session = create(
        profile === 'legacy'
          ? { model: legacyModel(), api: { token: '/token' } }
          : {},
      );
      await ready(session, profile === 'legacy');
      await session.resumeAudioCapture();
      expect(session.snapshot.isCapturing).toBe(true);
      const contexts = FakeAudioContext.instances.length;
      session.onPublish = key => {
        if (key !== 'isCapturing' || session.snapshot.isCapturing) return;
        session.onPublish = undefined;
        session.disconnect();
      };
      await session.resumeAudioCapture();
      expect(session.snapshot.status).toBe('disconnected');
      expect(session.snapshot.isCapturing).toBe(false);
      expect(FakeAudioContext.instances).toHaveLength(contexts);
      expect(
        FakeAudioContext.instances.every(
          context => context.close.mock.calls.length === 1,
        ),
      ).toBe(true);
    },
  );

  it('preserves legacy queued playback beyond two seconds and truncates the heard prefix on barge-in', async () => {
    const onError = vi.fn();
    const session = create({
      model: legacyModel(),
      api: { token: '/token' },
      onError,
    });
    await ready(session, true);
    const playback = FakeAudioContext.instances[0];
    playback.state = 'running';
    for (let index = 0; index < 4; index++)
      await emit({
        type: 'audio-delta',
        responseId: 'response',
        itemId: 'audio',
        delta: encodeRealtimeAudio(new Float32Array(24000)),
        raw: {},
      });
    expect(playback.sources).toHaveLength(4);
    expect(
      playback.sources.map(source => source.start.mock.calls[0][0]),
    ).toEqual([0, 1, 2, 3]);
    expect(
      playback.sources.every(source => source.stop.mock.calls.length === 0),
    ).toBe(true);
    playback.currentTime = 0.75;
    await emit({ type: 'speech-started', raw: {} });
    expect(socket().sent.at(-1)).toEqual({
      type: 'conversation-item-truncate',
      itemId: 'audio',
      contentIndex: 0,
      audioEndMs: 750,
    });
    expect(
      playback.sources.every(source => source.stop.mock.calls.length === 1),
    ).toBe(true);
    expect(onError).not.toHaveBeenCalled();
  });

  it('rejects a legacy playback budget before token or browser effects', async () => {
    const onError = vi.fn();
    await create({
      model: legacyModel(),
      api: { token: '/token' },
      maxPlaybackBufferSeconds: 2,
      onError,
    }).connect();
    expect(onError.mock.calls[0][0].message).toContain(
      'only for continuous PCM',
    );
    expect(browser.fetch).not.toHaveBeenCalled();
    expect(FakeWebSocket.instances).toHaveLength(0);
    expect(FakeAudioContext.instances).toHaveLength(0);
  });

  it('rejects server-confirmed provider delegation before readiness or capture', async () => {
    const onError = vi.fn();
    const session = create({ onError });
    await session.connect();
    socket().open();
    await emit({
      type: 'session-started',
      sessionId: 'unsupported',
      delegationMode: 'provider',
      raw: {},
    });
    expect(onError.mock.calls[0][0].message).toContain(
      'client delegation only',
    );
    expect(session.snapshot.status).toBe('error');
    expect(browser.getUserMedia).not.toHaveBeenCalled();
  });

  it('fails explicitly when a continuous model emits turn-based audio instead of dropping it', async () => {
    const onError = vi.fn();
    const session = create({ onError });
    await ready(session);
    await emit({
      type: 'audio-delta',
      responseId: 'r',
      itemId: 'i',
      delta: 'AAAA',
      raw: {},
    });
    expect(onError.mock.calls[0][0].message).toContain('use audio-chunk');
    expect(session.snapshot.status).toBe('error');
  });

  it('delivers client delegations and context without calling the legacy tool handler', async () => {
    const onToolCall = vi.fn(() => 'unused');
    const onEvent = vi.fn();
    const session = create({ onToolCall, onEvent });
    await ready(session);
    const delegation: RealtimeServerEvent = {
      type: 'delegation-created',
      delegationId: 'd',
      raw: {},
    };
    await emit(delegation);
    await emit(toolDone);
    expect(onEvent).toHaveBeenCalledWith(delegation);
    expect(session.snapshot.session?.delegations).toEqual([delegation]);
    expect(onToolCall).not.toHaveBeenCalled();
    await session.sendEvent({
      type: 'context-append',
      delegationId: 'd',
      content: 'app result',
    });
    expect(socket().sent.map(event => event.type)).toEqual([
      'session-start',
      'context-append',
    ]);
  });

  it.each([
    null,
    {},
    { url: 'wss://provider.test' },
    { token: null, url: 'wss://provider.test' },
    { token: 42, url: 'wss://provider.test' },
    { token: '', url: 'wss://provider.test' },
    { token: '  ', url: 'wss://provider.test' },
    { token: 'secret' },
    { token: 'secret', url: 42 },
    { token: 'secret', url: 'https://provider.test' },
    { token: 'secret', url: '/relative' },
    { token: 'secret', url: 'wss://provider.test', expiresAt: 'later' },
    { token: 'secret', url: 'wss://provider.test', expiresAt: -1 },
    { token: 'secret', url: 'wss://provider.test', tools: {} },
    {
      token: 'secret',
      url: 'wss://provider.test',
      tools: [{ type: 'function', name: 'tool' }],
    },
  ])(
    'rejects malformed token setup %# without falling back to relay',
    async payload => {
      browser.fetch.mockResolvedValueOnce(Response.json(payload));
      const model = legacyModel();
      const onError = vi.fn();
      const session = create({ model, api: { token: '/token' }, onError });
      await session.connect();
      expect(onError).toHaveBeenCalledOnce();
      expect(onError.mock.calls[0][0].message).toContain(
        'Invalid realtime setup',
      );
      expect(onError.mock.calls[0][0].message).not.toContain('secret');
      expect(session.snapshot.status).toBe('error');
      expect(model.getWebSocketConfig).not.toHaveBeenCalled();
      expect(FakeWebSocket.instances).toHaveLength(0);
      expect(FakeAudioContext.instances).toHaveLength(0);
      expect(browser.getUserMedia).not.toHaveBeenCalled();
    },
  );

  it('does not expose malformed token response contents through the error callback', async () => {
    browser.fetch.mockResolvedValueOnce(
      new Response('{"token":"private-credential",bad}'),
    );
    const onError = vi.fn();
    await create({
      model: legacyModel(),
      api: { token: '/token' },
      onError,
    }).connect();
    expect(onError).toHaveBeenCalledExactlyOnceWith(
      new Error('Invalid realtime setup response'),
    );
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it.each(['ws', 'wss'])(
    'accepts valid %s token setup with optional tools and expiration',
    async scheme => {
      const tools = [
        {
          type: 'function' as const,
          name: 'lookup',
          parameters: { type: 'object' as const },
        },
      ];
      browser.fetch.mockResolvedValueOnce(
        Response.json({
          token: 'secret',
          url: `${scheme}://provider.test`,
          expiresAt: Date.now() + 60_000,
          tools,
        }),
      );
      const model = legacyModel();
      const onError = vi.fn();
      const session = create({
        model,
        api: { token: '/token' },
        sessionConfig: { instructions: 'Be concise.' },
        onError,
      });
      await ready(session, true);
      expect(model.getWebSocketConfig).toHaveBeenCalledExactlyOnceWith({
        token: 'secret',
        url: `${scheme}://provider.test`,
      });
      expect(socket().sent[0]).toEqual({
        type: 'session-update',
        config: { instructions: 'Be concise.', tools },
      });
      expect(onError).not.toHaveBeenCalled();
    },
  );
});
