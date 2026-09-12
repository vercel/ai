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
  get snapshot() {
    return this.state;
  }
  protected setState() {}
}

describe('realtime lifecycle recovery and bounded resources', () => {
  let browser: ReturnType<typeof installLiveWebSocket>;
  let sessions: Session[];
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
  const readyWebSocket = async (session: Session, capture = true) => {
    await session.connect({ capture });
    socket().open();
    await emit({
      type: 'session-started',
      sessionId: 's',
      delegationMode: 'provider',
      raw: {},
    });
  };
  beforeEach(() => {
    browser = installLiveWebSocket();
    sessions = [];
  });
  afterEach(() => {
    sessions.forEach(session => session.dispose());
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('rejects an incompatible connection before any browser resources or token request', async () => {
    const onError = vi.fn();
    const session = create({ api: { token: '/token' }, onError });
    await session.connect();
    expect(onError).toHaveBeenCalledOnce();
    expect(session.snapshot.status).toBe('error');
    expect(browser.fetch).not.toHaveBeenCalled();
    expect(browser.getUserMedia).not.toHaveBeenCalled();
    expect(FakeWebSocket.instances).toHaveLength(0);
    expect(FakeAudioContext.instances).toHaveLength(0);
  });

  it('preserves legacy ownership of supplied capture and closes both token socket and microphone on congestion', async () => {
    const model = { ...liveModel(), capabilities: undefined };
    model.getWebSocketConfig = ({ url }) => ({ url });
    browser.fetch.mockResolvedValue(
      Response.json({ token: 'token', url: 'wss://provider.test' }),
    );
    const onError = vi.fn();
    const session = create({ model, api: { token: '/token' }, onError });
    await session.connect();
    socket().open();
    await emit({ type: 'session-created', sessionId: 'legacy', raw: {} });
    session.startAudioCapture(browser.stream);
    await flushEvents();
    socket().bufferedAmount = 128 * 1024 + 1;
    FakeAudioContext.instances[1].processors[0].onaudioprocess?.({
      inputBuffer: { getChannelData: () => new Float32Array(1024) },
    });
    await flushEvents();
    expect(session.snapshot.status).toBe('error');
    expect(session.snapshot.isCapturing).toBe(false);
    expect(socket().close).toHaveBeenCalledOnce();
    expect(FakeAudioContext.instances[1].close).toHaveBeenCalledOnce();
    expect(browser.track.stop).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledOnce();
    expect(() => session.sendEvent({ type: 'response-create' })).toThrow(
      'not accepting',
    );
  });

  it('fails closed at 512 inbound frames, retains the accepted prefix and queued final usage, and never accepts later frames', async () => {
    const onError = vi.fn();
    const onEvent = vi.fn();
    const session = create({
      api: { websocket: 'wss://relay.test' },
      onError,
      onEvent,
      maxEvents: 600,
    });
    await readyWebSocket(session);
    onEvent.mockClear();
    const text = deferred<string>();
    const blob = new Blob();
    vi.spyOn(blob, 'text').mockReturnValue(text.promise);
    socket().onmessage?.({ data: blob });
    for (let i = 1; i < 511; i++)
      socket().emit({ type: 'session-usage', usage: { seconds: i }, raw: {} });
    socket().emit({
      type: 'session-closed',
      usage: { seconds: 511 },
      reason: 'requested',
      raw: {},
    });
    socket().emit({ type: 'session-usage', usage: { seconds: 999 }, raw: {} });
    expect(session.snapshot.status).toBe('error');
    expect(session.snapshot.isCapturing).toBe(false);
    expect(socket().close).toHaveBeenCalledOnce();
    socket().emit({ type: 'session-usage', usage: { seconds: 1000 }, raw: {} });
    text.resolve(
      JSON.stringify({ type: 'session-usage', usage: { seconds: 0 }, raw: {} }),
    );
    for (let i = 0; i < 100; i++) await flushEvents();
    expect(onEvent).toHaveBeenCalledTimes(512);
    expect(onError).toHaveBeenCalledOnce();
    expect(session.snapshot.session).toMatchObject({
      usage: { seconds: 511 },
      finalization: 'confirmed',
    });
    expect(session.snapshot.status).toBe('error');
  });

  it.each(['serialize', 'send'] as const)(
    'settles close promptly after asynchronous %s failure and lets queued terminal usage win',
    async failure => {
      vi.useFakeTimers();
      const model = liveModel();
      const onError = vi.fn();
      const session = create({
        model,
        api: { websocket: 'wss://relay.test' },
        onError,
      });
      await readyWebSocket(session);
      if (failure === 'serialize')
        model.serializeClientEvent = async event => {
          if (event.type === 'session-close')
            throw new Error('close serialization failed');
          return event;
        };
      else
        socket().send.mockImplementationOnce(() => {
          throw new Error('close send failed');
        });
      const text = deferred<string>();
      const blob = new Blob();
      vi.spyOn(blob, 'text').mockReturnValue(text.promise);
      socket().onmessage?.({ data: blob });
      const closed = session.close();
      const settled = vi.fn();
      void closed.then(settled);
      await flushEvents();
      expect(browser.track.stop).toHaveBeenCalledOnce();
      expect(onError).toHaveBeenCalledOnce();
      expect(settled).not.toHaveBeenCalled();
      text.resolve(
        JSON.stringify({
          type: 'session-closed',
          usage: { seconds: 7 },
          reason: 'requested',
          raw: {},
        }),
      );
      await closed;
      expect(settled).toHaveBeenCalledOnce();
      expect(session.snapshot.session).toMatchObject({
        usage: { seconds: 7 },
        finalization: 'confirmed',
      });
      await vi.advanceTimersByTimeAsync(15_000);
      expect(socket().close).toHaveBeenCalledOnce();
    },
  );

  it('settles an unsent close unconfirmed without waiting 15 seconds', async () => {
    const model = liveModel();
    const session = create({ model, api: { websocket: 'wss://relay.test' } });
    await readyWebSocket(session);
    model.serializeClientEvent = async () => {
      throw new Error('cannot serialize');
    };
    await session.close();
    expect(session.snapshot.status).toBe('disconnected');
    expect(session.snapshot.session?.finalization).toBe('unconfirmed');
  });

  it('pauses only audio output when a suspended context exceeds two seconds and resumes at the live edge', async () => {
    const onError = vi.fn();
    const session = create({ api: { websocket: 'wss://relay.test' }, onError });
    await readyWebSocket(session);
    const playback = FakeAudioContext.instances[0];
    playback.state = 'suspended';
    const chunk = {
      type: 'audio-chunk',
      delta: encodeRealtimeAudio(new Float32Array(24000)),
      raw: {},
    } as const;
    await emit(chunk);
    await emit(chunk);
    await emit(chunk);
    await emit(chunk);
    expect(onError).toHaveBeenCalledOnce();
    expect(playback.sources).toHaveLength(2);
    expect(
      playback.sources.every(source => source.stop.mock.calls.length === 1),
    ).toBe(true);
    expect(session.snapshot.isPlaying).toBe(false);
    expect(session.snapshot.status).toBe('connected');
    await emit({ type: 'session-usage', usage: { seconds: 8 }, raw: {} });
    expect(session.snapshot.session?.usage).toEqual({ seconds: 8 });
    await session.resumePlayback();
    await emit(chunk);
    expect(playback.sources).toHaveLength(3);
    expect(session.snapshot.isPlaying).toBe(true);
    playback.state = 'suspended';
    await emit(chunk);
    await emit(chunk);
    expect(onError).toHaveBeenCalledTimes(2);
    expect(socket().close).not.toHaveBeenCalled();
  });

  it('supports capture-free websocket setup, borrowed reattachment, and close-time detach', async () => {
    const session = create({
      api: { websocket: 'wss://relay.test' },
    });
    await readyWebSocket(session, false);
    expect(browser.getUserMedia).not.toHaveBeenCalled();
    expect(session.snapshot.isCapturing).toBe(false);
    session.startAudioCapture(browser.stream);
    await flushEvents();
    expect(session.snapshot.isCapturing).toBe(true);
    session.stopAudioCapture();
    await flushEvents();
    expect(browser.track.stop).not.toHaveBeenCalled();
    expect(session.snapshot.isCapturing).toBe(false);
    await session.resumeAudioCapture();
    expect(session.snapshot.isCapturing).toBe(true);
    const closed = session.close();
    await flushEvents();
    expect(session.snapshot.isCapturing).toBe(false);
    expect(browser.track.stop).not.toHaveBeenCalled();
    await emit({
      type: 'session-closed',
      usage: { seconds: 1 },
      reason: 'requested',
      raw: {},
    });
    await closed;
  });

  it.each(['addToolOutput', 'sendEvent'] as const)(
    'defaults managed continuation off for %s and permits exactly one manual continuation',
    async method => {
      const onToolCall = vi.fn();
      const session = create({ onToolCall });
      await readyWebSocket(session);
      await emit({
        type: 'backend-tool-call',
        callId: 'c',
        responseId: 'r',
        name: 'test',
        arguments: '{}',
        raw: {},
      });
      await emit({
        type: 'backend-response-done',
        responseId: 'r',
        status: 'completed',
        raw: {},
      });
      expect(() =>
        session.sendEvent({ type: 'backend-response-create' }),
      ).toThrow('pending');
      if (method === 'addToolOutput') session.addToolOutput('c', 'ok');
      else
        await session.sendEvent({
          type: 'backend-tool-result',
          callId: 'c',
          output: 'ok',
        });
      await flushEvents();
      expect(
        socket().sent.filter(event => event.type === 'backend-response-create'),
      ).toHaveLength(0);
      await session.sendEvent({ type: 'backend-response-create' });
      await emit({
        type: 'backend-response-done',
        responseId: 'r',
        status: 'completed',
        raw: {},
      });
      await emit({
        type: 'backend-tool-call',
        callId: 'c',
        responseId: 'r',
        name: 'test',
        arguments: '{}',
        raw: {},
      });
      expect(onToolCall).toHaveBeenCalledOnce();
      expect(
        socket().sent.filter(event => event.type === 'backend-response-create'),
      ).toHaveLength(1);
    },
  );

  it('does not let stop capture race a late microphone acquisition', async () => {
    const media = deferred<MediaStream>();
    const session = create({ api: { websocket: 'wss://relay.test' } });
    await readyWebSocket(session, false);
    browser.getUserMedia.mockReturnValueOnce(media.promise);
    const resuming = session.resumeAudioCapture();
    session.stopAudioCapture();
    const late = fakeStream();
    media.resolve(late.stream);
    await resuming;
    expect(late.track.stop).toHaveBeenCalledOnce();
    expect(session.snapshot.isCapturing).toBe(false);
  });

  it('never evicts pending commands to admit another command and preserves acknowledgement association', async () => {
    const session = create();
    await readyWebSocket(session);
    for (let i = 0; i < 512; i++)
      await session.sendEvent({
        type: 'input-audio-mute',
        eventId: `mute-${i}`,
      });
    expect(() =>
      session.sendEvent({ type: 'input-audio-unmute', eventId: 'overflow' }),
    ).toThrow('pending');
    expect(session.snapshot.status).toBe('connected');
    await emit({
      type: 'command-acknowledged',
      clientEventId: 'mute-0',
      command: 'input_audio.mute',
      raw: {},
    });
    expect(session.snapshot.session?.isInputMuted).toBe(true);
    await session.sendEvent({ type: 'input-audio-unmute', eventId: 'unmute' });
    await emit({
      type: 'command-acknowledged',
      clientEventId: 'unmute',
      command: 'input_audio.unmute',
      raw: {},
    });
    expect(session.snapshot.session?.isInputMuted).toBe(false);
    expect(() => session.close({ eventId: 'mute-1' })).toThrow('fresh eventId');
    expect(session.snapshot.status).toBe('connected');
  });

  it('uses lifecycle metadata for a non-continuous model without inferring transport from conversation', async () => {
    const model = liveModel();
    const session = create({
      model: {
        ...model,
        capabilities: { ...model.capabilities!, conversation: 'turn-based' },
      },
    });
    await readyWebSocket(session, false);
    expect(session.snapshot.session?.sessionId).toBe('s');
    expect(session.snapshot.status).toBe('connected');
    const closed = session.close();
    await emit({
      type: 'session-closed',
      usage: { seconds: 2 },
      reason: 'requested',
      raw: {},
    });
    await closed;
    expect(session.snapshot.session?.finalization).toBe('confirmed');
  });

  it('stops SDK-owned legacy capture on congestion and ignores a stale serialization rejection after reconnect', async () => {
    const model = { ...liveModel(), capabilities: undefined };
    model.getWebSocketConfig = ({ url }) => ({ url });
    browser.fetch.mockImplementation(async () =>
      Response.json({ token: 'token', url: 'wss://provider.test' }),
    );
    const onError = vi.fn();
    const session = create({ model, api: { token: '/token' }, onError });
    await session.connect();
    socket().open();
    await emit({ type: 'session-created', sessionId: 'legacy', raw: {} });
    await session.resumeAudioCapture();
    const serialized = deferred<unknown>();
    model.serializeClientEvent = event =>
      event.type === 'input-audio-append' ? serialized.promise : event;
    FakeAudioContext.instances[1].processors[0].onaudioprocess?.({
      inputBuffer: { getChannelData: () => new Float32Array(1024) },
    });
    await flushEvents();
    session.disconnect();
    expect(browser.track.stop).toHaveBeenCalledOnce();
    browser.getUserMedia.mockResolvedValue(fakeStream().stream);
    await session.connect();
    socket().open();
    await emit({ type: 'session-created', sessionId: 'new', raw: {} });
    serialized.resolve({ type: 'input-audio-append', audio: 'late' });
    await flushEvents();
    expect(session.snapshot.status).toBe('connected');
    expect(onError).not.toHaveBeenCalled();
    await session.resumeAudioCapture();
    model.serializeClientEvent = event => event;
    socket().bufferedAmount = 128 * 1024 + 1;
    FakeAudioContext.instances[3].processors[0].onaudioprocess?.({
      inputBuffer: { getChannelData: () => new Float32Array(1024) },
    });
    await flushEvents();
    expect(session.snapshot.status).toBe('error');
    expect(socket().close).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledOnce();
  });
});
