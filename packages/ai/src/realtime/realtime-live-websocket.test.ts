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
import { decodeRealtimeAudio, encodeRealtimeAudio } from './audio-utils';
import type {
  RealtimeModel,
  RealtimeServerEvent,
} from '../types/realtime-model';
import { BrowserRealtimeTransport } from './browser-realtime-transport';

class Session extends AbstractRealtimeSession {
  get snapshot() {
    return this.state;
  }
  protected setState() {}
}

describe('Live over an application WebSocket relay', () => {
  let browser: ReturnType<typeof installLiveWebSocket>;
  const sessions: Session[] = [];
  const socket = () => FakeWebSocket.instances.at(-1)!;
  const create = (options: Partial<RealtimeSessionOptions> = {}) => {
    const session = new Session({
      model: liveModel(),
      api: { websocket: 'wss://app.example/live', protocols: ['app-protocol'] },
      ...options,
    });
    sessions.push(session);
    return session;
  };
  const emit = async (event: RealtimeServerEvent) => {
    socket().emit(event);
    await flushEvents();
  };
  const ready = async (
    session: Session,
    delegationMode: 'client' | 'provider' = 'client',
  ) => {
    await session.connect();
    socket().open();
    await flushEvents();
    await emit({
      type: 'session-started',
      sessionId: 'live-1',
      delegationMode,
      raw: {},
    });
  };
  beforeEach(() => {
    browser = installLiveWebSocket();
  });
  afterEach(() => {
    sessions.forEach(s => s.dispose());
    sessions.length = 0;
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each(['inputAudioFormat', 'outputAudioFormat'] as const)(
    'uses a single-sided %s PCM rate for both directions without mutating config',
    async side => {
      const format = Object.freeze({ type: 'audio/pcm', rate: 16000 });
      const config = Object.freeze({ [side]: format });
      const session = create({ sessionConfig: config });
      await ready(session);
      expect(socket().sent[0]).toMatchObject({
        type: 'session-start',
        config: {
          inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
          outputAudioFormat: { type: 'audio/pcm', rate: 16000 },
        },
      });
      expect(
        FakeAudioContext.instances.map(context => context.sampleRate),
      ).toEqual([16000, 16000]);
      expect(config).toEqual({ [side]: { type: 'audio/pcm', rate: 16000 } });
      expect(config[side]).toBe(format);
    },
  );

  it('leaves explicitly conflicting input/output rates for provider validation', async () => {
    const model = liveModel();
    const config = {
      inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
      outputAudioFormat: { type: 'audio/pcm', rate: 24000 },
    };
    model.serializeClientEvent = vi.fn(async event => {
      if (event.type === 'session-start') {
        expect(event.config).toEqual(config);
        throw new Error('Provider requires matching formats');
      }
      return event;
    });
    const onError = vi.fn();
    const session = create({ model, sessionConfig: config, onError });
    await session.connect();
    socket().open();
    await flushEvents();
    expect(onError).toHaveBeenCalledWith(
      new Error('Provider requires matching formats'),
    );
    expect(session.snapshot.status).toBe('error');
    expect(config.outputAudioFormat.rate).toBe(24000);
  });

  it('permits more than 4096 acknowledged commands while retaining recent duplicate protection', async () => {
    const session = create();
    await ready(session);
    for (let i = 0; i < 4100; i++) {
      await session.sendEvent({
        type: 'context-append',
        delegationId: null,
        content: '',
        eventId: `id-${i}`,
      });
      await emit({
        type: 'command-acknowledged',
        command: 'context.append',
        clientEventId: `id-${i}`,
        raw: {},
      });
    }
    expect(() =>
      session.sendEvent({
        type: 'context-append',
        delegationId: null,
        content: '',
        eventId: 'id-4099',
      }),
    ).toThrow('fresh eventId');
    session.disconnect();
    browser.getUserMedia.mockResolvedValue(fakeStream().stream);
    await ready(session);
    await session.sendEvent({
      type: 'context-append',
      delegationId: null,
      content: 'context',
      eventId: 'id-0',
    });
    expect(socket().sent.at(-1)).toMatchObject({
      type: 'context-append',
      eventId: 'id-0',
    });
  });

  it('preserves legacy provider no-op response commands without changing a connected session to error', async () => {
    const model: RealtimeModel = {
      ...liveModel(),
      capabilities: { conversation: 'turn-based', transports: ['websocket'] },
    };
    model.getWebSocketConfig = ({ url }) => ({
      url: url ?? 'wss://provider.example/live',
    });
    model.serializeClientEvent = async event =>
      event.type === 'response-create' ||
      event.type === 'response-cancel' ||
      event.type === 'conversation-item-truncate'
        ? null
        : event;
    browser.fetch.mockResolvedValueOnce(
      Response.json({
        token: 'test-token',
        url: 'wss://provider.example/live',
      }),
    );
    const onError = vi.fn();
    const session = create({ model, api: { token: '/api/token' }, onError });
    await session.connect();
    socket().open();
    await emit({ type: 'session-created', sessionId: 'legacy', raw: {} });
    session.sendTextMessage('hello');
    session.cancelResponse();
    await session.sendEvent({
      type: 'conversation-item-truncate',
      itemId: 'item-1',
      contentIndex: 0,
      audioEndMs: 10,
    });
    await flushEvents();
    expect(session.snapshot.status).toBe('connected');
    expect(onError).not.toHaveBeenCalled();
    expect(socket().sent.map(event => event.type)).toEqual([
      'session-update',
      'conversation-item-create',
    ]);
    expect(session.snapshot.messages[0].parts).toEqual([
      { type: 'text', text: 'hello', state: 'done' },
    ]);
  });

  it.each(['before-capture', 'during-send'] as const)(
    'preserves a delayed terminal Blob when the microphone ticks after closure %s',
    async timing => {
      const onError = vi.fn();
      const session = create({ onError });
      await ready(session);
      const text = deferred<string>();
      const blob = new Blob();
      vi.spyOn(blob, 'text').mockReturnValue(text.promise);
      socket().onmessage?.({ data: blob });
      await flushEvents();
      if (timing === 'before-capture') socket().close();
      else {
        const send = BrowserRealtimeTransport.prototype.sendEvent;
        vi.spyOn(
          BrowserRealtimeTransport.prototype,
          'sendEvent',
        ).mockImplementationOnce(
          function (this: BrowserRealtimeTransport, event) {
            socket().close();
            return send.call(this, event);
          },
        );
      }
      FakeAudioContext.instances[1].processors[0].onaudioprocess?.({
        inputBuffer: { getChannelData: () => new Float32Array(1024) },
      });
      await flushEvents();
      expect(session.snapshot.session?.finalization).toBe('pending');
      expect(onError).not.toHaveBeenCalled();
      text.resolve(
        JSON.stringify({
          type: 'session-closed',
          usage: { seconds: 12 },
          reason: 'requested',
          raw: {},
        }),
      );
      await flushEvents();
      expect(session.snapshot.session).toMatchObject({
        finalization: 'confirmed',
        usage: { seconds: 12 },
      });
      expect(session.snapshot.status).toBe('disconnected');
      expect(browser.track.stop).toHaveBeenCalledOnce();
    },
  );

  it('opens an explicit relay without provider browser authentication and sends session-start first', async () => {
    const model = liveModel();
    model.getWebSocketConfig = vi.fn(() => {
      throw new Error('Direct browser authentication is unsupported');
    });
    const session = create({ model });
    await session.connect();
    expect(model.getWebSocketConfig).not.toHaveBeenCalled();
    expect(socket().url).toBe('wss://app.example/live');
    expect(socket().protocols).toEqual(['app-protocol']);
    expect(socket().sent).toEqual([]);
    expect(FakeAudioContext.instances[0].resume).toHaveBeenCalledOnce();
    expect(browser.getUserMedia).not.toHaveBeenCalled();
    expect(() => session.sendTextMessage('early')).toThrow('application-owned');
    socket().open();
    await flushEvents();
    expect(socket().sent).toEqual([
      {
        type: 'session-start',
        config: {
          inputAudioFormat: { type: 'audio/pcm', rate: 24000 },
          outputAudioFormat: { type: 'audio/pcm', rate: 24000 },
        },
      },
    ]);
    expect(browser.getUserMedia).not.toHaveBeenCalled();
    await emit({
      type: 'session-started',
      sessionId: 'live-1',
      delegationMode: 'client',
      raw: {},
    });
    expect(session.snapshot.status).toBe('connected');
    expect(browser.getUserMedia).toHaveBeenCalledOnce();
    expect(() =>
      session.sendEvent({ type: 'session-start', config: {} }),
    ).toThrow('already started');
    expect(session.snapshot.isCapturing).toBe(true);
    await emit({
      type: 'session-started',
      sessionId: 'live-1',
      delegationMode: 'client',
      raw: {},
    });
    expect(browser.getUserMedia).toHaveBeenCalledOnce();
    expect(socket().sent.filter(e => e.type === 'session-start')).toHaveLength(
      1,
    );
  });

  it.each(['audio/pcmu', 'audio/pcma', 'audio/opus'])(
    'rejects unsupported %s codecs before socket or microphone effects',
    async type => {
      const onError = vi.fn();
      const session = create({
        sessionConfig: { outputAudioFormat: { type } },
        onError,
      });
      await session.connect();
      expect(FakeWebSocket.instances).toHaveLength(0);
      expect(FakeAudioContext.instances).toHaveLength(0);
      expect(browser.getUserMedia).not.toHaveBeenCalled();
      expect(onError).toHaveBeenCalled();
      expect(session.snapshot.status).toBe('error');
    },
  );

  it('encodes microphone frames as PCM16 and plays continuous audio without speech cutoffs', async () => {
    const session = create();
    await ready(session);
    const capture = FakeAudioContext.instances[1];
    capture.processors[0].onaudioprocess?.({
      inputBuffer: { getChannelData: () => new Float32Array([-1, 0, 1]) },
    });
    await flushEvents();
    const audio = socket().sent.at(-1)!;
    expect(audio.type).toBe('input-audio-append');
    expect([...decodeRealtimeAudio(audio.audio as string)]).toEqual([
      -1,
      0,
      32767 / 32768,
    ]);
    await emit({
      type: 'audio-chunk',
      delta: encodeRealtimeAudio(new Float32Array(240)),
      raw: {},
    });
    expect(session.snapshot.isPlaying).toBe(true);
    const playback = FakeAudioContext.instances[0];
    expect(playback.sources).toHaveLength(1);
    await emit({ type: 'speech-started', raw: {} });
    expect(playback.sources[0].stop).not.toHaveBeenCalled();
    session.disconnect();
    expect(capture.close).toHaveBeenCalledOnce();
    expect(capture.processors[0].disconnect).toHaveBeenCalledOnce();
    expect(capture.mediaSources[0].disconnect).toHaveBeenCalledOnce();
    expect(capture.processors[0].onaudioprocess).toBeNull();
    expect(playback.close).toHaveBeenCalledOnce();
    expect(browser.track.stop).toHaveBeenCalledOnce();
  });

  it('cancels late microphone acquisition after readiness and leaves caller-owned tracks alone', async () => {
    const media = deferred<MediaStream>();
    browser.getUserMedia.mockReturnValueOnce(media.promise);
    const session = create();
    await ready(session);
    session.disconnect();
    media.resolve(browser.stream);
    await flushEvents();
    expect(browser.track.stop).toHaveBeenCalledOnce();
    const supplied = fakeStream();
    await session.connect({ stream: supplied.stream });
    socket().open();
    await flushEvents();
    await emit({ type: 'session-started', sessionId: 'second', raw: {} });
    expect(session.snapshot.isCapturing).toBe(true);
    session.disconnect();
    expect(supplied.track.stop).not.toHaveBeenCalled();
    expect(browser.getUserMedia).toHaveBeenCalledOnce();
  });

  it('cancels a connecting socket and ignores its callbacks after reconnect', async () => {
    const session = create();
    await session.connect();
    const stale = socket();
    session.disconnect();
    await session.connect();
    stale.open();
    stale.emit({ type: 'session-started', sessionId: 'stale', raw: {} });
    await flushEvents();
    expect(stale.sent).toEqual([]);
    expect(session.snapshot.status).toBe('connecting');
    expect(session.snapshot.session?.sessionId).toBeUndefined();
    expect(browser.getUserMedia).not.toHaveBeenCalled();
  });

  it('bounds startup while waiting for the provider and releases playback', async () => {
    vi.useFakeTimers();
    const session = create({ startupTimeoutMs: 50 });
    await session.connect();
    socket().open();
    await vi.advanceTimersByTimeAsync(51);
    expect(session.snapshot.status).toBe('error');
    expect(FakeAudioContext.instances[0].close).toHaveBeenCalledOnce();
    expect(socket().close).toHaveBeenCalledOnce();
  });

  it('reports microphone permission failure recoverably and permits another capture attempt', async () => {
    const onError = vi.fn();
    browser.getUserMedia.mockRejectedValueOnce(new Error('permission denied'));
    const session = create({ onError });
    await ready(session);
    expect(session.snapshot.status).toBe('connected');
    expect(socket().close).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(new Error('permission denied'));
    await session.resumeAudioCapture();
    expect(session.snapshot.isCapturing).toBe(true);
  });

  it('rejects codec changes and pauses overflowing playback until explicit recovery', async () => {
    const onError = vi.fn();
    const session = create({ onError });
    await ready(session);
    expect(() =>
      session.sendEvent({
        type: 'session-update',
        config: { inputAudioFormat: { type: 'audio/pcmu' } },
      }),
    ).toThrow('requires reconnecting');
    await emit({
      type: 'audio-chunk',
      delta: encodeRealtimeAudio(new Float32Array(24000 * 3)),
      raw: {},
    });
    expect(session.snapshot.status).toBe('connected');
    expect(onError).toHaveBeenCalledWith(
      new Error(
        'Realtime audio playback buffer is full; playback paused, call resumePlayback() to resume at the live edge',
      ),
    );
    expect(session.snapshot.isPlaying).toBe(false);
    await session.resumePlayback();
    await emit({
      type: 'audio-chunk',
      delta: encodeRealtimeAudio(new Float32Array(240)),
      raw: {},
    });
    expect(session.snapshot.isPlaying).toBe(true);
  });

  it('drains terminal usage already received before the socket close event', async () => {
    const session = create();
    await ready(session);
    const closing = session.close();
    await flushEvents();
    socket().emit({
      type: 'session-closed',
      usage: { seconds: 12 },
      reason: 'requested',
      raw: {},
    });
    socket().close();
    await closing;
    expect(session.snapshot.session).toMatchObject({
      usage: { seconds: 12 },
      finalization: 'confirmed',
    });
    expect(session.snapshot.status).toBe('disconnected');
  });

  it('keeps terminal finalization when an in-flight audio send fails during socket shutdown', async () => {
    const serialized = deferred<unknown>();
    const model = liveModel();
    model.serializeClientEvent = async event =>
      event.type === 'input-audio-append' ? serialized.promise : event;
    const session = create({ model });
    await ready(session);
    FakeAudioContext.instances[1].processors[0].onaudioprocess?.({
      inputBuffer: { getChannelData: () => new Float32Array(1024) },
    });
    await flushEvents();
    socket().emit({
      type: 'session-closed',
      usage: { seconds: 12 },
      reason: 'requested',
      raw: {},
    });
    socket().close();
    serialized.resolve({ type: 'input-audio-append', audio: '' });
    await flushEvents();
    expect(session.snapshot.session?.finalization).toBe('confirmed');
    expect(session.snapshot.status).toBe('disconnected');
  });

  it('drains slow earlier frames in order before confirming finalization', async () => {
    const session = create();
    await ready(session);
    const text = deferred<string>();
    const blob = new Blob();
    vi.spyOn(blob, 'text').mockReturnValue(text.promise);
    socket().onmessage?.({ data: blob });
    socket().emit({
      type: 'session-closed',
      usage: { seconds: 12 },
      reason: 'requested',
      raw: {},
    });
    socket().close();
    await flushEvents();
    expect(session.snapshot.session?.finalization).toBe('pending');
    text.resolve(
      JSON.stringify({
        type: 'session-usage',
        usage: { seconds: 10 },
        raw: {},
      }),
    );
    await flushEvents();
    expect(session.snapshot.session?.finalization).toBe('confirmed');
    expect(session.snapshot.session?.usage).toEqual({ seconds: 12 });
  });

  it('keeps the last usage as unconfirmed on loss and has a 15-second graceful close deadline', async () => {
    vi.useFakeTimers();
    const session = create();
    await ready(session);
    await emit({ type: 'session-usage', usage: { seconds: 5 }, raw: {} });
    const closing = session.close();
    await vi.advanceTimersByTimeAsync(14_999);
    expect(session.snapshot.status).toBe('closing');
    await vi.advanceTimersByTimeAsync(1);
    await closing;
    expect(session.snapshot.session).toMatchObject({
      usage: { seconds: 5 },
      finalization: 'unconfirmed',
    });
  });

  it('reports an abnormal relay close and preserves unconfirmed finalization', async () => {
    const onError = vi.fn();
    const session = create({ onError });
    await ready(session);

    socket().closeFromServer({
      code: 1007,
      reason: 'Request contains an invalid argument',
      wasClean: true,
    });

    expect(onError).toHaveBeenCalledExactlyOnceWith(
      new Error(
        'Realtime WebSocket closed unexpectedly (code 1007: Request contains an invalid argument)',
      ),
    );
    expect(session.snapshot.status).toBe('closing');
    await flushEvents();
    expect(session.snapshot.status).toBe('error');
    expect(session.snapshot.session?.finalization).toBe('unconfirmed');
  });

  it('keeps continuous text application-owned and allows context append', async () => {
    const session = create();
    await ready(session, 'client');
    expect(session.snapshot.session?.delegationMode).toBe('client');
    expect(() => session.sendTextMessage('hello')).toThrow('application-owned');
    expect(() => session.addToolOutput('call', 'result')).toThrow(
      'application-owned',
    );
    await session.sendEvent({
      type: 'context-append',
      delegationId: 'd1',
      content: 'app-owned context',
    });
    expect(socket().sent.at(-1)?.type).toBe('context-append');
  });

  it('surfaces malformed incoming JSON and bounds outbound media backpressure', async () => {
    const onError = vi.fn();
    const session = create({ onError });
    await ready(session);
    socket().onmessage?.({ data: '{invalid' });
    await flushEvents();
    expect(onError.mock.calls[0][0].message).toContain('Invalid JSON');
    socket().bufferedAmount = 256 * 1024;
    FakeAudioContext.instances[1].processors[0].onaudioprocess?.({
      inputBuffer: { getChannelData: () => new Float32Array(1024) },
    });
    await flushEvents();
    expect(session.snapshot.status).toBe('error');
    expect(browser.track.stop).toHaveBeenCalledOnce();
  });
});
