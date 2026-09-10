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
      autoContinueTools: true,
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
    delegationMode: 'client' | 'provider' = 'provider',
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
  const call: RealtimeServerEvent = {
    type: 'backend-tool-call',
    responseId: 'r1',
    callId: 'call-1',
    name: 'lookup',
    arguments: '{}',
    raw: {},
  };
  const done: RealtimeServerEvent = {
    type: 'backend-response-done',
    responseId: 'r1',
    status: 'completed',
    raw: {},
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

  it.each(['before-done', 'after-continuation'] as const)(
    'allows corrected output after a correlated rejection %s without rerunning the tool',
    async order => {
      const onToolCall = vi.fn(() => 'invalid-output');
      const onEvent = vi.fn();
      const onError = vi.fn();
      const session = create({ onToolCall, onEvent, onError });
      await ready(session);
      await emit(call);
      const first = socket().sent.find(
        event => event.type === 'backend-tool-result',
      )!;
      expect(first.eventId).toEqual(expect.any(String));
      if (order === 'after-continuation') await emit(done);
      const rejection: RealtimeServerEvent = {
        type: 'error',
        message: 'Invalid tool result',
        clientEventId: String(first.eventId),
        raw: { error: 'provider rejection' },
      };
      await emit(rejection);
      expect(onError).toHaveBeenCalledWith(new Error('Invalid tool result'));
      expect(onEvent).toHaveBeenCalledWith(rejection);
      await emit(call);
      expect(onToolCall).toHaveBeenCalledOnce();
      await session.sendEvent({
        type: 'backend-tool-result',
        callId: 'call-1',
        output: 'corrected-output',
      });
      if (order === 'before-done') await emit(done);
      await flushEvents();
      const results = socket().sent.filter(
        event => event.type === 'backend-tool-result',
      );
      expect(results.map(event => event.output)).toEqual([
        'invalid-output',
        'corrected-output',
      ]);
      expect(results[1].eventId).not.toBe(first.eventId);
      await emit(rejection);
      session.addToolOutput('call-1', 'duplicate');
      await flushEvents();
      expect(
        socket().sent.filter(event => event.type === 'backend-tool-result'),
      ).toHaveLength(2);
      expect(
        socket().sent.filter(event => event.type === 'backend-response-create'),
      ).toHaveLength(order === 'before-done' ? 1 : 2);
      expect(onToolCall).toHaveBeenCalledOnce();
    },
  );

  it('cancels a continuation still serializing when its tool output is rejected', async () => {
    const continuation = deferred<unknown>();
    let firstContinuation = true;
    const model = liveModel();
    model.serializeClientEvent = async event => {
      if (event.type === 'backend-response-create' && firstContinuation) {
        firstContinuation = false;
        return continuation.promise;
      }
      return event;
    };
    const onToolCall = vi.fn(() => 'invalid-output');
    const session = create({ model, onToolCall });
    await ready(session);
    await emit(call);
    await emit(done);
    const result = socket().sent.find(
      event => event.type === 'backend-tool-result',
    )!;
    await emit({
      type: 'error',
      message: 'Invalid result',
      clientEventId: String(result.eventId),
      raw: {},
    });
    const corrected = session.sendEvent({
      type: 'backend-tool-result',
      callId: 'call-1',
      output: 'corrected-output',
    });
    continuation.resolve({ type: 'backend-response-create' });
    await corrected;
    await flushEvents();
    expect(
      socket().sent.filter(event => event.type === 'backend-response-create'),
    ).toHaveLength(1);
    expect(
      socket()
        .sent.slice(-2)
        .map(event => event.type),
    ).toEqual(['backend-tool-result', 'backend-response-create']);
    expect(onToolCall).toHaveBeenCalledOnce();
  });

  it('requires a fresh command ID for different calls and corrected retries', async () => {
    const session = create();
    await ready(session);
    await emit(call);
    await emit({ ...call, callId: 'call-2' });
    await session.sendEvent({
      type: 'backend-tool-result',
      callId: 'call-1',
      output: 'first',
      eventId: 'shared-id',
    });
    expect(() =>
      session.sendEvent({
        type: 'backend-tool-result',
        callId: 'call-2',
        output: 'second',
        eventId: 'shared-id',
      }),
    ).toThrow('fresh eventId');
    expect(() =>
      session.sendEvent({ type: 'input-audio-mute', eventId: 'shared-id' }),
    ).toThrow('fresh eventId');
    await emit({
      type: 'error',
      message: 'Invalid result',
      clientEventId: 'shared-id',
      raw: {},
    });
    expect(() =>
      session.sendEvent({
        type: 'backend-tool-result',
        callId: 'call-1',
        output: 'corrected',
        eventId: 'shared-id',
      }),
    ).toThrow('fresh eventId');
    await session.sendEvent({
      type: 'backend-tool-result',
      callId: 'call-1',
      output: 'corrected',
      eventId: 'new-id',
    });
    expect(socket().sent.at(-1)).toMatchObject({
      output: 'corrected',
      eventId: 'new-id',
    });
  });

  it('ignores errors from an old socket after reconnect even when call IDs repeat', async () => {
    const onError = vi.fn();
    const session = create({ onToolCall: () => 'result', onError });
    await ready(session);
    await emit(call);
    const old = socket();
    const first = old.sent.find(event => event.type === 'backend-tool-result')!;
    session.disconnect();
    browser.getUserMedia.mockResolvedValue(fakeStream().stream);
    await ready(session);
    await emit(call);
    await emit(done);
    old.emit({
      type: 'error',
      message: 'stale rejection',
      clientEventId: String(first.eventId),
      raw: {},
    });
    await flushEvents();
    session.addToolOutput('call-1', 'duplicate');
    expect(onError).not.toHaveBeenCalled();
    expect(
      socket().sent.filter(event => event.type === 'backend-tool-result'),
    ).toHaveLength(1);
    expect(
      socket().sent.filter(event => event.type === 'backend-response-create'),
    ).toHaveLength(1);
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
    await emit(call);
    session.addToolOutput('call-1', 'result');
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
    await emit(call);
    await session.sendEvent({
      type: 'backend-tool-result',
      callId: 'call-1',
      output: 'result',
      eventId: 'id-0',
    });
    expect(socket().sent.at(-1)).toMatchObject({
      type: 'backend-tool-result',
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

  it('tracks public tool-result commands, preserves event IDs, and deduplicates both APIs', async () => {
    const output = deferred<unknown>();
    const model = liveModel();
    model.serializeClientEvent = event =>
      event.type === 'backend-tool-result'
        ? output.promise
        : Promise.resolve(event);
    const session = create({ model });
    await ready(session);
    await emit(call);
    const result = {
      type: 'backend-tool-result' as const,
      callId: 'call-1',
      output: 'manual',
      eventId: 'result-1',
    };
    const sent = session.sendEvent(result);
    expect(session.sendEvent({ ...result, eventId: 'duplicate' })).toBe(sent);
    session.addToolOutput('call-1', 'duplicate');
    expect(() =>
      session.sendEvent({ type: 'backend-response-create' }),
    ).toThrow('pending realtime tool results');
    output.resolve(result);
    await sent;
    await session.sendEvent(result);
    await emit(done);
    expect(
      socket().sent.filter(event => event.type === 'backend-tool-result'),
    ).toEqual([result]);
    expect(
      socket().sent.filter(event => event.type === 'backend-response-create'),
    ).toHaveLength(1);
    await expect(
      session.sendEvent({
        type: 'backend-response-create',
        eventId: 'explicit-next-response',
      }),
    ).resolves.toBeUndefined();
  });

  it('does not apply a stale public tool-result completion to a reconnected session', async () => {
    const output = deferred<unknown>();
    const model = liveModel();
    let delay = true;
    model.serializeClientEvent = event =>
      event.type === 'backend-tool-result' && delay
        ? output.promise
        : Promise.resolve(event);
    const session = create({ model });
    await ready(session);
    await emit(call);
    await emit(done);
    const result = {
      type: 'backend-tool-result' as const,
      callId: 'call-1',
      output: 'stale',
    };
    const sent = session.sendEvent(result);
    const rejected = expect(sent).rejects.toThrow('closed');
    await flushEvents();
    session.disconnect();
    browser.getUserMedia.mockResolvedValue(fakeStream().stream);
    await ready(session);
    await emit(call);
    await emit(done);
    output.resolve(result);
    await rejected;
    await flushEvents();
    expect(
      socket().sent.filter(event => event.type === 'backend-response-create'),
    ).toHaveLength(0);
    expect(() =>
      session.sendEvent({ type: 'backend-response-create' }),
    ).toThrow('pending realtime tool results');
    delay = false;
    await session.sendEvent({
      ...result,
      output: 'current',
      eventId: 'current-output',
    });
    await flushEvents();
    expect(
      socket()
        .sent.slice(-2)
        .map(event => event.type),
    ).toEqual(['backend-tool-result', 'backend-response-create']);
  });

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
    expect(() => session.sendTextMessage('early')).toThrow('not accepting');
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
      delegationMode: 'provider',
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
      delegationMode: 'provider',
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

  it('encodes microphone frames as PCM16 and plays continuous audio without speech/backend cutoffs', async () => {
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
    await emit(done);
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

  it('uses only server-confirmed delegation mode to gate backend submissions', async () => {
    const session = create();
    await ready(session, 'client');
    expect(session.snapshot.session?.delegationMode).toBe('client');
    expect(() => session.sendTextMessage('backend')).toThrow(
      'provider delegation mode',
    );
    await session.sendEvent({
      type: 'context-append',
      delegationId: 'd1',
      content: 'app-owned context',
    });
    expect(socket().sent.at(-1)?.type).toBe('context-append');
  });

  it('does not mark failed tool sends as submitted or send phantom continuations', async () => {
    const model = liveModel();
    let fail = true;
    model.serializeClientEvent = async event => {
      if (event.type === 'backend-tool-result' && fail)
        throw new Error('serializer rejected output');
      return event;
    };
    const onError = vi.fn();
    const session = create({ model, onError });
    await ready(session);
    await emit(call);
    await emit(done);
    session.addToolOutput('call-1', 'result');
    await flushEvents();
    expect(onError).toHaveBeenCalledWith(
      new Error('serializer rejected output'),
    );
    expect(
      socket().sent.filter(e => e.type === 'backend-response-create'),
    ).toHaveLength(0);
    expect(() => session.sendTextMessage('new request')).toThrow(
      'pending realtime tool results',
    );
    fail = false;
    session.addToolOutput('call-1', 'result');
    await flushEvents();
    expect(
      socket()
        .sent.slice(-2)
        .map(e => e.type),
    ).toEqual(['backend-tool-result', 'backend-response-create']);
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
