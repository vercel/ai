import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AbstractRealtimeSession,
  type RealtimeSessionOptions,
} from './realtime-session';
import {
  deferred,
  fakeStream,
  flushEvents,
  liveModel,
} from './__fixtures__/fake-realtime';
import {
  FakeAudioContext,
  FakeWebSocket,
  installLiveWebSocket,
} from './__fixtures__/fake-live-websocket';
import { encodeRealtimeAudio } from './audio-utils';
import type { RealtimeServerEvent } from '../types/realtime-model';

class Session extends AbstractRealtimeSession {
  onUpdate?: () => void;
  get snapshot() {
    return this.state;
  }
  protected setState() {
    this.onUpdate?.();
  }
}

describe('realtime ownership, command turnover, and independent lifecycle semantics', () => {
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
  const tokenModel = () => ({
    ...liveModel(),
    capabilities: undefined,
    getWebSocketConfig: ({ url }: { url: string }) => ({ url }),
  });
  const socket = () => FakeWebSocket.instances.at(-1)!;
  const emit = async (event: RealtimeServerEvent) => {
    socket().emit(event);
    await flushEvents();
  };
  const startWebSocket = async (
    session: Session,
    delegationMode: 'client' | 'provider' = 'client',
  ) => {
    await session.connect({ capture: false });
    socket().open();
    await emit({
      type: 'session-started',
      sessionId: 'session',
      delegationMode,
      raw: {},
    });
  };
  beforeEach(() => {
    browser = installLiveWebSocket();
  });
  afterEach(() => {
    sessions.forEach(session => session.dispose());
    sessions.length = 0;
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each([
    { from: 'subscriber', completion: 'terminal' },
    { from: 'onError', completion: 'terminal' },
    { from: 'subscriber', completion: 'timeout' },
    { from: 'onError', completion: 'timeout' },
  ])(
    'joins failure draining when $from calls close, completing via $completion',
    async ({ from, completion }) => {
      vi.useFakeTimers();
      const onError = vi.fn();
      const session = create({ onError });
      await startWebSocket(session);
      await emit({ type: 'session-usage', usage: { seconds: 5 }, raw: {} });
      const text = deferred<string>();
      const blob = new Blob();
      vi.spyOn(blob, 'text').mockReturnValue(text.promise);
      let closed: Promise<void> | undefined;
      const settled = vi.fn();
      const close = () => {
        if (closed != null) return;
        session.onUpdate = undefined;
        closed = session.close();
        void closed.then(settled);
      };
      if (from === 'subscriber') {
        session.onUpdate = () => {
          if (session.snapshot.status === 'error') close();
        };
      } else onError.mockImplementation(close);
      socket().emit({
        type: 'audio-delta',
        responseId: 'r',
        itemId: 'a',
        delta: 'AAA=',
        raw: {},
      });
      socket().onmessage?.({ data: blob });
      await flushEvents();
      expect(closed).toBeDefined();
      expect(settled).not.toHaveBeenCalled();
      expect(session.close()).toBe(closed);
      expect(session.snapshot.status).toBe('error');
      await vi.advanceTimersByTimeAsync(999);
      expect(settled).not.toHaveBeenCalled();
      if (completion === 'timeout') await vi.advanceTimersByTimeAsync(1);
      text.resolve(
        JSON.stringify({
          type: 'session-closed',
          usage: { seconds: 7.125 },
          reason: 'requested',
          raw: {},
        }),
      );
      await closed;
      await flushEvents();
      expect(session.snapshot.status).toBe('error');
      expect(session.snapshot.session).toMatchObject({
        finalization: completion === 'terminal' ? 'confirmed' : 'unconfirmed',
        usage: { seconds: completion === 'terminal' ? 7.125 : 5 },
      });
      expect(settled).toHaveBeenCalledOnce();
      expect(onError).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          message: expect.stringContaining('Turn-based audio-delta'),
        }),
      );
      expect(socket().close).toHaveBeenCalledOnce();
      expect(socket().sent.some(event => event.type === 'session-close')).toBe(
        false,
      );
    },
  );

  describe.each(['legacy', 'continuous'] as const)(
    '%s manual audio rejection ownership',
    profile => {
      const audio = encodeRealtimeAudio(new Float32Array(240));
      const setup = async () => {
        const model = profile === 'legacy' ? tokenModel() : liveModel();
        const onError = vi.fn();
        browser.fetch.mockImplementation(async () =>
          Response.json({ token: 'token', url: 'wss://provider.test' }),
        );
        const session = create({
          model,
          api:
            profile === 'legacy'
              ? { token: '/token' }
              : { websocket: 'wss://relay.test' },
          onError,
        });
        const connect = async () => {
          await session.connect({ capture: false });
          socket().open();
          await emit(
            profile === 'legacy'
              ? { type: 'session-created', sessionId: 's', raw: {} }
              : {
                  type: 'session-started',
                  sessionId: 's',
                  delegationMode: 'client',
                  raw: {},
                },
          );
        };
        await connect();
        return { session, model, onError, connect };
      };

      it.each(['dispose', 'disconnect'] as const)(
        'suppresses a queued manual audio rejection after ordinary %s',
        async teardown => {
          const { session, onError } = await setup();
          const ws = socket();
          ws.send.mockClear();
          session.sendAudio(audio);
          session[teardown]();
          const snapshot = session.snapshot;
          await flushEvents();
          expect(onError).not.toHaveBeenCalled();
          expect(ws.send).not.toHaveBeenCalled();
          expect(ws.close).toHaveBeenCalledOnce();
          expect(session.snapshot).toBe(snapshot);
          expect(session.snapshot.status).toBe('disconnected');
        },
      );

      it('reports active manual audio errors recoverably and permits the next send', async () => {
        const { session, onError } = await setup();
        const error = new Error('Manual audio send failed');
        socket().send.mockImplementationOnce(() => {
          throw error;
        });
        session.sendAudio(audio);
        await flushEvents();
        expect(onError).toHaveBeenCalledExactlyOnceWith(error);
        expect(session.snapshot.status).toBe('connected');
        session.sendAudio(audio);
        await flushEvents();
        expect(socket().sent.at(-1)).toEqual({
          type: 'input-audio-append',
          audio,
        });
        expect(socket().close).not.toHaveBeenCalled();
        expect(onError).toHaveBeenCalledOnce();
      });

      it('ignores a retired connection rejection without suppressing replacement errors', async () => {
        const { session, model, onError, connect } = await setup();
        const pending = deferred<void>();
        const original = model.serializeClientEvent;
        model.serializeClientEvent = async event => {
          await pending.promise;
          return event;
        };
        session.sendAudio(audio);
        await flushEvents();
        const oldSocket = socket();
        session.disconnect();
        model.serializeClientEvent = original;
        await connect();
        const replacement = socket();
        pending.resolve();
        await flushEvents();
        expect(onError).not.toHaveBeenCalled();
        expect(oldSocket.close).toHaveBeenCalledOnce();
        const error = new Error('Replacement audio send failed');
        replacement.send.mockImplementationOnce(() => {
          throw error;
        });
        session.sendAudio(audio);
        await flushEvents();
        expect(onError).toHaveBeenCalledExactlyOnceWith(error);
        expect(session.snapshot.status).toBe('connected');
        expect(replacement.close).not.toHaveBeenCalled();
      });
    },
  );

  it('starts explicit legacy capture immediately before connect and keeps the same engine through asynchronous setup', async () => {
    const setup = deferred<Response>();
    browser.fetch.mockReturnValueOnce(setup.promise);
    const onError = vi.fn();
    const session = create({
      model: tokenModel(),
      api: { token: '/token' },
      onError,
    });
    session.startAudioCapture(browser.stream);
    expect(session.snapshot.isCapturing).toBe(true);
    expect(FakeAudioContext.instances).toHaveLength(1);
    const capture = FakeAudioContext.instances[0];
    const process = () =>
      capture.processors[0].onaudioprocess?.({
        inputBuffer: { getChannelData: () => new Float32Array(1024) },
      });
    process();
    expect(FakeWebSocket.instances).toHaveLength(0);
    const connecting = session.connect();
    process();
    expect(session.snapshot.isCapturing).toBe(true);
    expect(capture.close).not.toHaveBeenCalled();
    setup.resolve(
      Response.json({ token: 'token', url: 'wss://provider.test' }),
    );
    await connecting;
    socket().open();
    process();
    await flushEvents();
    expect(socket().sent.map(event => event.type)).toEqual(['session-update']);
    await emit({ type: 'session-created', sessionId: 'legacy', raw: {} });
    process();
    await flushEvents();
    expect(socket().sent.at(-1)?.type).toBe('input-audio-append');
    expect(capture.close).not.toHaveBeenCalled();
    expect(capture.createMediaStreamSource).toHaveBeenCalledExactlyOnceWith(
      browser.stream,
    );
    expect(browser.getUserMedia).not.toHaveBeenCalled();
    session.dispose();
    expect(browser.track.stop).toHaveBeenCalledOnce();
    expect(capture.close).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
  });

  it.each(['stop', 'dispose'] as const)(
    'releases preconnect legacy tracks on %s and preserves stop intent through connect',
    async action => {
      const session = create({ model: tokenModel(), api: { token: '/token' } });
      session.startAudioCapture(browser.stream);
      if (action === 'stop') session.stopAudioCapture();
      else session.dispose();
      expect(browser.track.stop).toHaveBeenCalledOnce();
      expect(session.snapshot.isCapturing).toBe(false);
      browser.fetch.mockResolvedValueOnce(
        Response.json({ token: 'token', url: 'wss://provider.test' }),
      );
      await session.connect();
      socket().open();
      await emit({ type: 'session-created', sessionId: 'legacy', raw: {} });
      expect(session.snapshot.isCapturing).toBe(false);
      expect(browser.getUserMedia).not.toHaveBeenCalled();
      const next = fakeStream();
      browser.getUserMedia.mockResolvedValueOnce(next.stream);
      await session.resumeAudioCapture();
      session.dispose();
      expect(next.track.stop).toHaveBeenCalledOnce();
      expect(browser.track.stop).toHaveBeenCalledOnce();
    },
  );

  it.each(['explicit-capture', 'connect-stream'] as const)(
    'replaces preconnect legacy capture with a new stream via %s',
    async action => {
      const session = create({ model: tokenModel(), api: { token: '/token' } });
      const next = fakeStream();
      session.startAudioCapture(browser.stream);
      if (action === 'explicit-capture') session.startAudioCapture(next.stream);
      browser.fetch.mockResolvedValueOnce(
        Response.json({ token: 'token', url: 'wss://provider.test' }),
      );
      if (action === 'connect-stream')
        await session.connect({ stream: next.stream });
      else await session.connect();
      expect(browser.track.stop).toHaveBeenCalledOnce();
      expect(
        FakeAudioContext.instances[1].createMediaStreamSource,
      ).toHaveBeenCalledExactlyOnceWith(next.stream);
      expect(session.snapshot.isCapturing).toBe(true);
      session.dispose();
      expect(next.track.stop).toHaveBeenCalledOnce();
    },
  );

  it('honors capture:false for an already capturing legacy engine', async () => {
    const session = create({ model: tokenModel(), api: { token: '/token' } });
    session.startAudioCapture(browser.stream);
    browser.fetch.mockResolvedValueOnce(
      Response.json({ token: 'token', url: 'wss://provider.test' }),
    );
    await session.connect({ capture: false });
    socket().open();
    await emit({ type: 'session-created', sessionId: 'legacy', raw: {} });
    expect(session.snapshot.isCapturing).toBe(false);
    expect(browser.track.stop).toHaveBeenCalledOnce();
    expect(browser.getUserMedia).not.toHaveBeenCalled();
  });

  it('rejects unsupported Live preconnect capture explicitly without allocating audio', async () => {
    const session = create();
    expect(() => session.startAudioCapture(browser.stream)).toThrow(
      'not accepting capture',
    );
    await expect(session.resumeAudioCapture()).rejects.toThrow(
      'not accepting capture',
    );
    expect(FakeAudioContext.instances).toHaveLength(0);
    expect(browser.track.stop).not.toHaveBeenCalled();
  });

  it.each(['continuous', 'legacy-session-close'] as const)(
    'joins a subscriber close to remote draining and keeps terminal usage for %s',
    async profile => {
      vi.useFakeTimers();
      const model = liveModel();
      const onError = vi.fn();
      const onToolCall = vi.fn();
      const session = create({
        model:
          profile === 'legacy-session-close'
            ? {
                ...model,
                capabilities: {
                  transports: ['websocket'],
                  connections: ['server-websocket'],
                  finalization: 'session-close',
                  conversation: 'turn-based',
                  startup: 'session-update',
                },
              }
            : model,
        onError,
        onToolCall,
        startupTimeoutMs: 50,
        closeTimeoutMs: 50,
      });
      await session.connect({ capture: false });
      socket().open();
      await emit(
        profile === 'continuous'
          ? {
              type: 'session-started',
              sessionId: 's',
              delegationMode: 'client',
              raw: {},
            }
          : { type: 'session-created', sessionId: 's', raw: {} },
      );
      await session.resumeAudioCapture();
      expect(session.snapshot.isCapturing).toBe(true);
      const text = deferred<string>();
      const blob = new Blob();
      vi.spyOn(blob, 'text').mockReturnValue(text.promise);
      socket().onmessage?.({ data: blob });
      let joined: Promise<void> | undefined;
      session.onUpdate = () => {
        if (session.snapshot.status === 'closing') joined ??= session.close();
      };
      socket().closeFromServer({ code: 1006, wasClean: false });
      expect(session.snapshot.status).toBe('closing');
      expect(session.snapshot.isCapturing).toBe(false);
      expect(browser.track.stop).toHaveBeenCalledOnce();
      expect(joined).toBeDefined();
      expect(session.close()).toBe(joined);
      expect(() => session.sendEvent({ type: 'response-create' })).toThrow(
        'not accepting',
      );
      const settled = vi.fn();
      void joined?.then(settled);
      await vi.advanceTimersByTimeAsync(100);
      expect(settled).not.toHaveBeenCalled();
      text.resolve(
        JSON.stringify({
          type: 'session-closed',
          usage: { seconds: 7.125 },
          reason: 'requested',
          raw: {},
        }),
      );
      await flushEvents();
      await joined;
      expect(session.snapshot.status).toBe('disconnected');
      expect(session.snapshot.session).toMatchObject({
        finalization: 'confirmed',
        usage: { seconds: 7.125 },
      });
      expect(settled).toHaveBeenCalledOnce();
      expect(onError).not.toHaveBeenCalled();
      expect(onToolCall).not.toHaveBeenCalled();
    },
  );

  it.each(['startup', 'close'] as const)(
    'cancels the old %s deadline while draining a delayed terminal after socket closure',
    async deadline => {
      vi.useFakeTimers();
      const onError = vi.fn();
      const session = create({
        onError,
        startupTimeoutMs: 50,
        closeTimeoutMs: 50,
      });
      await session.connect({ capture: false });
      socket().open();
      if (deadline === 'close') {
        await emit({
          type: 'session-started',
          sessionId: 's',
          delegationMode: 'client',
          raw: {},
        });
        void session.close();
      }
      await vi.advanceTimersByTimeAsync(49);
      const text = deferred<string>();
      const blob = new Blob();
      vi.spyOn(blob, 'text').mockReturnValue(text.promise);
      socket().onmessage?.({ data: blob });
      socket().emit({
        type: 'session-closed',
        usage: { seconds: 2 },
        reason: 'requested',
        raw: {},
      });
      socket().closeFromServer({ code: 1006, wasClean: false });
      await vi.advanceTimersByTimeAsync(100);
      expect(session.snapshot.status).toBe('closing');
      text.resolve(
        JSON.stringify({
          type: 'session-started',
          sessionId: 's',
          delegationMode: 'client',
          raw: {},
        }),
      );
      await flushEvents();
      expect(browser.getUserMedia).not.toHaveBeenCalled();
      expect(session.snapshot.status).toBe('disconnected');
      expect(session.snapshot.session?.finalization).toBe('confirmed');
      expect(onError).not.toHaveBeenCalled();
    },
  );

  it('does not publish delayed readiness or run queued legacy tools after remote close', async () => {
    const onError = vi.fn();
    const onToolCall = vi.fn();
    browser.fetch.mockResolvedValueOnce(
      Response.json({ token: 'token', url: 'wss://provider.test' }),
    );
    const session = create({
      model: tokenModel(),
      api: { token: '/token' },
      onError,
      onToolCall,
    });
    const statuses: string[] = [];
    session.onUpdate = () => {
      statuses.push(session.snapshot.status);
    };
    await session.connect();
    socket().open();
    const text = deferred<string>();
    const blob = new Blob();
    vi.spyOn(blob, 'text').mockReturnValue(text.promise);
    socket().onmessage?.({ data: blob });
    socket().emit({
      type: 'function-call-arguments-done',
      responseId: 'r',
      itemId: 'i',
      callId: 'c',
      name: 'lookup',
      arguments: '{}',
      raw: {},
    });
    socket().closeFromServer();
    text.resolve(
      JSON.stringify({ type: 'session-created', sessionId: 'legacy', raw: {} }),
    );
    await flushEvents();
    expect(statuses).not.toContain('connected');
    expect(onToolCall).not.toHaveBeenCalled();
    expect(session.snapshot.status).toBe('error');
    expect(onError).toHaveBeenCalledExactlyOnceWith(
      new Error('Realtime connection closed before becoming ready'),
    );
  });

  it('does not rearm a close deadline when a closing subscriber receives the remote close', async () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    const session = create({ onError, closeTimeoutMs: 50 });
    await startWebSocket(session);
    const text = deferred<string>();
    const blob = new Blob();
    vi.spyOn(blob, 'text').mockReturnValue(text.promise);
    socket().onmessage?.({ data: blob });
    session.onUpdate = () => {
      if (session.snapshot.status !== 'closing') return;
      session.onUpdate = undefined;
      socket().closeFromServer();
    };
    const closing = session.close();
    const settled = vi.fn();
    void closing.then(settled);
    await vi.advanceTimersByTimeAsync(100);
    expect(session.snapshot.status).toBe('closing');
    expect(settled).not.toHaveBeenCalled();
    expect(socket().sent.some(event => event.type === 'session-close')).toBe(
      false,
    );
    text.resolve(
      JSON.stringify({
        type: 'session-closed',
        usage: { seconds: 1 },
        reason: 'requested',
        raw: {},
      }),
    );
    await closing;
    expect(session.snapshot.session?.finalization).toBe('confirmed');
    expect(onError).not.toHaveBeenCalled();
  });

  it('keeps a replacement session alive when the closing subscriber reconnects', async () => {
    vi.useFakeTimers();
    const session = create();
    await startWebSocket(session);
    const old = socket();
    let connecting: Promise<void> | undefined;
    session.onUpdate = () => {
      if (session.snapshot.status !== 'closing') return;
      session.onUpdate = undefined;
      session.disconnect();
      connecting = session.connect({ capture: false });
    };
    old.closeFromServer();
    await connecting;
    const replacement = socket();
    replacement.open();
    await emit({
      type: 'session-started',
      sessionId: 'new',
      delegationMode: 'client',
      raw: {},
    });
    await vi.advanceTimersByTimeAsync(31_000);
    expect(session.snapshot.status).toBe('connected');
    expect(replacement.close).not.toHaveBeenCalled();
    await session.sendEvent({
      type: 'context-append',
      content: 'new',
      delegationId: null,
    });
  });

  it.each([1000, 1011])(
    'retains normal versus abnormal remote close classification for code %s',
    async code => {
      const onError = vi.fn();
      const session = create({ onError });
      await startWebSocket(session);
      socket().closeFromServer({ code });
      expect(session.snapshot.status).toBe('closing');
      await session.close();
      expect(session.snapshot.status).toBe(
        code === 1000 ? 'disconnected' : 'error',
      );
      expect(session.snapshot.session?.finalization).toBe('unconfirmed');
      expect(onError).toHaveBeenCalledTimes(code === 1000 ? 0 : 1);
    },
  );

  it('fences pending automatic audio serialization when a remote close accepts terminal usage', async () => {
    const serialized = deferred<void>();
    const model = tokenModel();
    model.serializeClientEvent = async event => {
      if (event.type === 'input-audio-append') await serialized.promise;
      return event;
    };
    const onError = vi.fn();
    browser.fetch.mockResolvedValueOnce(
      Response.json({ token: 'token', url: 'wss://provider.test' }),
    );
    const session = create({ model, api: { token: '/token' }, onError });
    await session.connect();
    socket().open();
    await emit({ type: 'session-created', sessionId: 's', raw: {} });
    session.startAudioCapture(browser.stream);
    FakeAudioContext.instances[1].processors[0].onaudioprocess?.({
      inputBuffer: { getChannelData: () => new Float32Array(1024) },
    });
    await flushEvents();
    const text = deferred<string>();
    const blob = new Blob();
    vi.spyOn(blob, 'text').mockReturnValue(text.promise);
    socket().onmessage?.({ data: blob });
    socket().closeFromServer();
    serialized.resolve();
    await flushEvents();
    expect(session.snapshot.status).toBe('closing');
    expect(socket().sent.map(event => event.type)).toEqual(['session-update']);
    text.resolve(
      JSON.stringify({
        type: 'response-done',
        responseId: 'r',
        status: 'completed',
        raw: {},
      }),
    );
    await session.close();
    expect(session.snapshot.status).toBe('disconnected');
    expect(onError).not.toHaveBeenCalled();
  });

  it('drains accepted final usage on fatal automatic legacy audio send failure', async () => {
    const base = liveModel();
    const model = {
      ...base,
      capabilities: {
        transports: ['websocket'] as const,
        connections: ['server-websocket'] as const,
        conversation: 'turn-based' as const,
        startup: 'session-update' as const,
        finalization: 'session-close' as const,
      },
    };
    const onError = vi.fn();
    const session = create({ model, onError });
    await session.connect();
    socket().open();
    await emit({ type: 'session-created', sessionId: 's', raw: {} });
    await session.resumeAudioCapture();
    const text = deferred<string>();
    const blob = new Blob();
    vi.spyOn(blob, 'text').mockReturnValue(text.promise);
    socket().onmessage?.({ data: blob });
    socket().send.mockImplementationOnce(() => {
      throw new Error('Native WebSocket send failed');
    });
    FakeAudioContext.instances[1].processors[0].onaudioprocess?.({
      inputBuffer: { getChannelData: () => new Float32Array(1024) },
    });
    await flushEvents();
    expect(session.snapshot.status).toBe('error');
    expect(session.snapshot.isCapturing).toBe(false);
    text.resolve(
      JSON.stringify({
        type: 'session-closed',
        usage: { seconds: 9 },
        reason: 'requested',
        raw: {},
      }),
    );
    await session.close();
    expect(session.snapshot.status).toBe('error');
    expect(session.snapshot.session).toMatchObject({
      finalization: 'confirmed',
      usage: { seconds: 9 },
    });
    expect(onError).toHaveBeenCalledOnce();
    expect(socket().close).toHaveBeenCalledOnce();
  });

  it.each(['legacy-token', 'turn-based-relay'] as const)(
    'preserves large startup, text, tool output and audio with a large backlog for %s',
    async profile => {
      const content = 'é'.repeat(128 * 1024);
      const audio = 'AAAA'.repeat(64 * 1024);
      const onError = vi.fn();
      const onToolCall = vi.fn(() => content);
      browser.fetch.mockResolvedValueOnce(
        Response.json({ token: 'token', url: 'wss://provider.test' }),
      );
      const session = create({
        model:
          profile === 'legacy-token'
            ? tokenModel()
            : {
                ...liveModel(),
                capabilities: {
                  transports: ['websocket'],
                  connections: ['server-websocket'],
                  conversation: 'turn-based',
                  startup: 'session-start',
                  finalization: 'session-close',
                },
              },
        api:
          profile === 'legacy-token'
            ? { token: '/token' }
            : { websocket: 'wss://relay.test' },
        sessionConfig: { instructions: content },
        onError,
        onToolCall,
      });
      await session.connect();
      socket().bufferedAmount = 8 * 1024 * 1024;
      socket().open();
      await flushEvents();
      expect(socket().sent).toEqual([
        {
          type: profile === 'legacy-token' ? 'session-update' : 'session-start',
          config: { instructions: content },
        },
      ]);
      await emit(
        profile === 'legacy-token'
          ? { type: 'session-created', sessionId: 'large', raw: {} }
          : {
              type: 'session-started',
              sessionId: 'large',
              delegationMode: 'client',
              raw: {},
            },
      );
      session.sendTextMessage(content);
      session.sendAudio(audio);
      await emit({
        type: 'function-call-arguments-done',
        responseId: 'r',
        itemId: 'tool',
        callId: 'call',
        name: 'lookup',
        arguments: '{}',
        raw: {},
      });
      expect(onToolCall).toHaveBeenCalledOnce();
      expect(socket().sent).toEqual(
        expect.arrayContaining([
          {
            type: 'conversation-item-create',
            item: { type: 'text-message', role: 'user', text: content },
          },
          { type: 'input-audio-append', audio },
          {
            type: 'conversation-item-create',
            item: {
              type: 'function-call-output',
              callId: 'call',
              name: 'lookup',
              output: JSON.stringify(content),
            },
          },
        ]),
      );
      await session.resumeAudioCapture();
      const sentCount = socket().sent.length;
      FakeAudioContext.instances[1].processors[0].onaudioprocess?.({
        inputBuffer: { getChannelData: () => new Float32Array(1024) },
      });
      await flushEvents();
      expect(socket().sent).toHaveLength(sentCount + 1);
      expect(socket().sent.at(-1)?.type).toBe('input-audio-append');
      expect(session.snapshot.status).toBe('connected');
      expect(session.snapshot.isCapturing).toBe(true);
      expect(onError).not.toHaveBeenCalled();
      expect(socket().close).not.toHaveBeenCalled();
    },
  );

  it('keeps oversized Live manual audio and control sends recoverable while rejecting oversized startup', async () => {
    const onError = vi.fn();
    const session = create({ onError });
    await startWebSocket(session);
    const content = 'é'.repeat(128 * 1024);
    await expect(
      session.sendEvent({
        type: 'context-append',
        content,
        delegationId: null,
      }),
    ).rejects.toThrow('frame exceeds');
    await expect(
      session.sendEvent({ type: 'input-audio-append', audio: content }),
    ).rejects.toThrow('frame exceeds');
    session.sendAudio(content);
    await flushEvents();
    expect(onError).toHaveBeenCalledTimes(2);
    expect(session.snapshot.status).toBe('connected');
    await session.sendEvent({
      type: 'context-append',
      content: 'small',
      delegationId: null,
    });
    session.disconnect();
    const startupError = vi.fn();
    const oversized = create({
      sessionConfig: { instructions: content },
      onError: startupError,
    });
    await oversized.connect({ capture: false });
    socket().open();
    await flushEvents();
    expect(oversized.snapshot.status).toBe('error');
    expect(startupError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        message: expect.stringContaining('reduce the event payload'),
      }),
    );
  });

  it('isolates failed-close draining from a synchronous onError reconnect', async () => {
    vi.useFakeTimers();
    const closeSerialization = deferred<void>();
    const oldInbound = deferred<string>();
    const failure = new Error('close serialization failed');
    const model = liveModel();
    model.serializeClientEvent = async event => {
      if (event.type === 'session-close') {
        await closeSerialization.promise;
        throw failure;
      }
      return event;
    };
    const onError = vi.fn();
    const session = create({
      model,
      api: { websocket: 'wss://relay.test' },
      onError,
    });
    await startWebSocket(session);
    const oldSocket = socket();
    const blob = new Blob();
    vi.spyOn(blob, 'text').mockReturnValue(oldInbound.promise);
    oldSocket.onmessage?.({ data: blob });
    let reconnecting: Promise<void> | undefined;
    onError.mockImplementationOnce(() => {
      session.disconnect();
      reconnecting = session.connect({ capture: false });
    });
    const closed = session.close();
    const settled = vi.fn();
    void closed.then(settled);
    await flushEvents();
    expect(onError).not.toHaveBeenCalled();
    expect(settled).not.toHaveBeenCalled();
    closeSerialization.resolve();
    await flushEvents();
    await reconnecting;
    await closed;
    expect(settled).toHaveBeenCalledOnce();
    expect(oldSocket.close).toHaveBeenCalledOnce();
    const replacement = socket();
    expect(replacement).not.toBe(oldSocket);
    replacement.open();
    await emit({
      type: 'session-started',
      sessionId: 'replacement',
      delegationMode: 'client',
      raw: {},
    });
    await session.sendEvent({
      type: 'context-append',
      content: 'connected',
      delegationId: null,
      eventId: 'first',
    });
    await vi.advanceTimersByTimeAsync(16_000);
    expect(session.snapshot.status).toBe('connected');
    expect(replacement.close).not.toHaveBeenCalled();
    oldInbound.resolve(
      JSON.stringify({
        type: 'session-closed',
        usage: { seconds: 99 },
        reason: 'requested',
        raw: {},
      }),
    );
    await flushEvents();
    await session.sendEvent({
      type: 'context-append',
      content: 'still connected',
      delegationId: null,
      eventId: 'second',
    });
    expect(replacement.sent).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'context-append',
          eventId: 'first',
        }),
        expect.objectContaining({
          type: 'context-append',
          eventId: 'second',
        }),
      ]),
    );
    expect(session.snapshot.session).toMatchObject({
      sessionId: 'replacement',
      finalization: 'pending',
    });
    expect(session.snapshot.status).toBe('connected');
    expect(replacement.close).not.toHaveBeenCalled();
    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(onError).toHaveBeenCalledExactlyOnceWith(failure);
    expect(settled).toHaveBeenCalledOnce();
  });

  it.each(['acquired', 'supplied'] as const)(
    'retains and disposes early legacy %s capture while token setup is pending',
    async ownership => {
      const setup = deferred<Response>();
      browser.fetch.mockReturnValueOnce(setup.promise);
      const onError = vi.fn();
      const session = create({
        model: tokenModel(),
        api: { token: '/token' },
        onError,
      });
      const connecting = session.connect();
      if (ownership === 'supplied') {
        session.startAudioCapture(browser.stream);
        await flushEvents();
      } else await session.resumeAudioCapture();
      expect(session.snapshot.isCapturing).toBe(true);
      expect(
        FakeAudioContext.instances[0].createMediaStreamSource,
      ).toHaveBeenCalledWith(browser.stream);
      expect(FakeWebSocket.instances).toHaveLength(0);
      session.disconnect();
      expect(browser.track.stop).toHaveBeenCalledOnce();
      setup.resolve(
        Response.json({ token: 'token', url: 'wss://provider.test' }),
      );
      await connecting;
      expect(FakeWebSocket.instances).toHaveLength(0);
      expect(session.snapshot.status).toBe('disconnected');
      expect(session.snapshot.isCapturing).toBe(false);
      expect(onError).not.toHaveBeenCalled();
    },
  );

  it.each(['stop', 'disconnect'] as const)(
    'stops a late acquired legacy microphone after %s during slow token setup',
    async action => {
      const setup = deferred<Response>();
      const media = deferred<MediaStream>();
      browser.fetch.mockReturnValueOnce(setup.promise);
      browser.getUserMedia.mockReturnValueOnce(media.promise);
      const session = create({ model: tokenModel(), api: { token: '/token' } });
      const connecting = session.connect();
      const resuming = session.resumeAudioCapture();
      if (action === 'stop') session.stopAudioCapture();
      else session.disconnect();
      media.resolve(browser.stream);
      await resuming;
      expect(browser.track.stop).toHaveBeenCalledOnce();
      expect(session.snapshot.isCapturing).toBe(false);
      expect(FakeAudioContext.instances).toHaveLength(0);
      setup.resolve(
        Response.json({ token: 'token', url: 'wss://provider.test' }),
      );
      await connecting;
      expect(session.snapshot.isCapturing).toBe(false);
    },
  );

  it('keeps early supplied legacy capture through token completion and resumes with a fresh owned stream after stopping', async () => {
    const setup = deferred<Response>();
    browser.fetch.mockReturnValueOnce(setup.promise);
    const session = create({ model: tokenModel(), api: { token: '/token' } });
    const connecting = session.connect();
    session.startAudioCapture(browser.stream);
    await flushEvents();
    setup.resolve(
      Response.json({ token: 'token', url: 'wss://provider.test' }),
    );
    await connecting;
    socket().open();
    await emit({ type: 'session-created', sessionId: 'legacy', raw: {} });
    expect(session.snapshot.isCapturing).toBe(true);
    expect(browser.getUserMedia).not.toHaveBeenCalled();
    session.stopAudioCapture();
    expect(browser.track.stop).toHaveBeenCalledOnce();
    const next = fakeStream();
    browser.getUserMedia.mockResolvedValueOnce(next.stream);
    await session.resumeAudioCapture();
    session.disconnect();
    expect(next.track.stop).toHaveBeenCalledOnce();
    expect(browser.track.stop).toHaveBeenCalledOnce();
  });

  it.each(['session-start', 'session-update'] as const)(
    'keeps turn-based text, audio, tools and commit semantics with %s startup plus session-close finalization',
    async startup => {
      const base = liveModel();
      const onToolCall = vi.fn(() => 'tool output');
      const onError = vi.fn();
      const session = create({
        model: {
          ...base,
          capabilities: {
            conversation: 'turn-based',
            transports: ['websocket'],
            connections: ['server-websocket'],
            startup,
            finalization: 'session-close',
          },
        },
        api: { websocket: 'wss://relay.test' },
        onToolCall,
        onError,
      });
      await session.connect();
      socket().open();
      await flushEvents();
      expect(socket().sent[0].type).toBe(startup);
      await emit({ type: 'session-created', sessionId: 'turns', raw: {} });
      if (startup === 'session-start') {
        expect(session.snapshot.status).toBe('connecting');
        await emit({
          type: 'session-started',
          sessionId: 'turns',
          delegationMode: 'client',
          raw: {},
        });
      }
      expect(session.snapshot.status).toBe('connected');
      session.sendTextMessage('hello');
      session.commitAudio();
      session.clearAudioBuffer();
      await emit({
        type: 'text-delta',
        responseId: 'r',
        itemId: 'text',
        delta: 'Hello back',
        raw: {},
      });
      await emit({
        type: 'audio-delta',
        responseId: 'r',
        itemId: 'audio',
        delta: encodeRealtimeAudio(new Float32Array(240)),
        raw: {},
      });
      await emit({
        type: 'function-call-arguments-delta',
        responseId: 'r',
        itemId: 'tool',
        callId: 'call',
        delta: '{}',
        raw: {},
      });
      await emit({
        type: 'function-call-arguments-done',
        responseId: 'r',
        itemId: 'tool',
        callId: 'call',
        name: 'lookup',
        arguments: '{}',
        raw: {},
      });
      await emit({
        type: 'response-done',
        responseId: 'r',
        status: 'completed',
        raw: {},
      });
      expect(onToolCall).toHaveBeenCalledOnce();
      expect(
        session.snapshot.messages.flatMap(message => message.parts),
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'text', text: 'hello' }),
          expect.objectContaining({ type: 'text', text: 'Hello back' }),
          expect.objectContaining({
            type: 'dynamic-tool',
            toolCallId: 'call',
            state: 'output-available',
            output: 'tool output',
          }),
        ]),
      );
      expect(FakeAudioContext.instances[0].sources).toHaveLength(1);
      expect(socket().sent).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'conversation-item-create' }),
          expect.objectContaining({ type: 'input-audio-commit' }),
          expect.objectContaining({ type: 'input-audio-clear' }),
        ]),
      );
      expect(
        socket().sent.filter(event => event.type === 'response-create'),
      ).toHaveLength(2);
      const closed = session.close();
      await emit({
        type: 'session-closed',
        usage: { seconds: 3 },
        reason: 'requested',
        raw: {},
      });
      await closed;
      expect(session.snapshot.session?.finalization).toBe('confirmed');
      expect(onError).not.toHaveBeenCalled();
    },
  );
});
