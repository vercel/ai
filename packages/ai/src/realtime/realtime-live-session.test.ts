import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RealtimeServerEvent } from '../types/realtime-model';
import {
  AbstractRealtimeSession,
  type RealtimeSessionOptions,
} from './realtime-session';
import {
  deferred,
  FakePeerConnection,
  fakeStream,
  flushEvents,
  installWebRTC,
  liveModel,
} from './__fixtures__/fake-webrtc';

class Session extends AbstractRealtimeSession {
  get snapshot() {
    return this.state;
  }
  protected setState() {}
}

describe('continuous realtime sessions', () => {
  let browser: ReturnType<typeof installWebRTC>;
  const sessions: Session[] = [];
  const create = (options: Partial<RealtimeSessionOptions> = {}) => {
    const session = new Session({
      model: liveModel(),
      api: { session: '/api/session' },
      autoContinueTools: true,
      ...options,
    });
    sessions.push(session);
    return session;
  };
  const channel = () => FakePeerConnection.instances.at(-1)!.dc;
  const emit = async (event: RealtimeServerEvent) => {
    channel().emit(event);
    await flushEvents();
  };
  const call = (
    callId: string,
    responseId = 'response-1',
  ): RealtimeServerEvent => ({
    type: 'backend-tool-call',
    callId,
    responseId,
    name: 'lookup',
    arguments: '{}',
    raw: {},
  });
  const done = (responseId = 'response-1'): RealtimeServerEvent => ({
    type: 'backend-response-done',
    responseId,
    status: 'completed',
    raw: {},
  });

  beforeEach(() => {
    browser = installWebRTC();
  });
  afterEach(() => {
    sessions.forEach(session => session.dispose());
    sessions.length = 0;
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('negotiates one session with model-owned channel configuration and microphone media', async () => {
    const config = { instructions: 'Listen carefully' };
    const session = create({ sessionConfig: config });
    await session.connect();
    await flushEvents();
    expect(browser.getUserMedia).toHaveBeenCalledExactlyOnceWith({
      audio: true,
    });
    const pc = FakePeerConnection.instances[0];
    expect(pc.createDataChannel).toHaveBeenCalledWith('model-events');
    expect(pc.addTrack).toHaveBeenCalledWith(browser.track, browser.stream);
    expect(browser.fetch).toHaveBeenCalledExactlyOnceWith(
      '/api/session',
      expect.objectContaining({
        body: JSON.stringify({ sdp: 'local-offer', sessionConfig: config }),
        signal: expect.any(AbortSignal),
      }),
    );
    expect(pc.setRemoteDescription).toHaveBeenCalledWith({
      type: 'answer',
      sdp: 'remote-answer',
    });
    expect(session.snapshot.status).toBe('connected');
    expect(session.snapshot.session?.sessionId).toBe('session-1');
    expect(session.snapshot.isCapturing).toBe(true);
    expect(channel().sent).toEqual([]);
  });

  it('rejects submissions before session-started and duplicate connects', async () => {
    FakePeerConnection.autoStart = false;
    const session = create();
    await session.connect();
    expect(session.snapshot.status).toBe('connecting');
    expect(() => session.sendTextMessage('too soon')).toThrow('not accepting');
    await expect(session.connect()).rejects.toThrow('already active');
    await emit({
      type: 'session-started',
      sessionId: 'ready',
      delegationMode: 'provider',
      raw: {},
    });
    session.sendTextMessage('hello');
    await flushEvents();
    expect(channel().sent).toEqual([
      {
        type: 'backend-input-create',
        content: [{ type: 'text', text: 'hello' }],
      },
      { type: 'backend-response-create' },
    ]);
  });

  it('stops a late acquired microphone after disconnect and ignores stale setup', async () => {
    const media = deferred<MediaStream>();
    browser.getUserMedia.mockReturnValueOnce(media.promise);
    const session = create();
    const connecting = session.connect();
    session.disconnect();
    await connecting;
    media.resolve(browser.stream);
    await flushEvents();
    expect(browser.track.stop).toHaveBeenCalledOnce();
    expect(browser.fetch).not.toHaveBeenCalled();
    expect(FakePeerConnection.instances).toHaveLength(0);
    expect(session.snapshot.session?.finalization).toBe('unconfirmed');
  });

  it('aborts an SDP request and ignores its late answer after reconnect', async () => {
    const response = deferred<Response>();
    browser.fetch.mockReturnValueOnce(response.promise);
    const session = create();
    const connecting = session.connect();
    await flushEvents();
    const pc = FakePeerConnection.instances[0];
    const signal = (
      browser.fetch.mock.calls[0] as unknown as [string, RequestInit]
    )[1].signal;
    session.disconnect();
    await connecting;
    expect(signal?.aborted).toBe(true);
    browser.getUserMedia.mockResolvedValue(fakeStream().stream);
    await session.connect();
    response.resolve(Response.json({ sdp: 'late', sessionId: 'late' }));
    await flushEvents();
    expect(pc.setRemoteDescription).not.toHaveBeenCalled();
    expect(session.snapshot.session?.sessionId).toBe('session-1');
  });

  it.each(['ice', 'data-channel', 'session-started'] as const)(
    'bounds %s startup and releases media',
    async stage => {
      vi.useFakeTimers();
      if (stage === 'ice') FakePeerConnection.gather = false;
      if (stage === 'data-channel') FakePeerConnection.autoOpen = false;
      FakePeerConnection.autoStart = false;
      const onError = vi.fn();
      const session = create({ startupTimeoutMs: 50, onError });
      const connecting = session.connect();
      await flushEvents();
      await vi.advanceTimersByTimeAsync(51);
      await connecting;
      expect(session.snapshot.status).toBe('error');
      expect(session.snapshot.session?.finalization).toBe('unconfirmed');
      expect(browser.track.stop).toHaveBeenCalledOnce();
      expect(onError).toHaveBeenCalled();
    },
  );

  it('does not stop caller-owned tracks', async () => {
    const session = create();
    await session.connect({ stream: browser.stream });
    session.disconnect();
    expect(browser.getUserMedia).not.toHaveBeenCalled();
    expect(browser.track.stop).not.toHaveBeenCalled();
  });

  it('tracks microphone interruption separately from protocol mute and detaches listeners', async () => {
    const session = create();
    const removeListener = vi.spyOn(browser.track, 'removeEventListener');
    await session.connect({ stream: browser.stream });
    browser.track.muted = true;
    browser.track.dispatchEvent(new Event('mute'));
    expect(session.snapshot.isCapturing).toBe(false);
    expect(session.snapshot.session?.isInputMuted).toBe(false);
    browser.track.muted = false;
    browser.track.dispatchEvent(new Event('unmute'));
    expect(session.snapshot.isCapturing).toBe(true);
    session.disconnect();
    expect(removeListener).toHaveBeenCalledTimes(3);
    browser.track.dispatchEvent(new Event('unmute'));
    expect(session.snapshot.isCapturing).toBe(false);
  });

  it('releases media on an invalid SDP response and reports playback recovery failures', async () => {
    const onError = vi.fn();
    const session = create({ onError });
    browser.fetch.mockResolvedValueOnce(Response.json({ sdp: 42 }));
    await session.connect();
    expect(session.snapshot.status).toBe('error');
    expect(browser.track.stop).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(
      new Error('Invalid realtime session answer'),
    );
    browser.getUserMedia.mockResolvedValue(fakeStream().stream);
    await session.connect();
    browser.audio.play.mockRejectedValueOnce(new Error('autoplay blocked'));
    FakePeerConnection.instances
      .at(-1)!
      .ontrack?.({ streams: [browser.stream] });
    await flushEvents();
    expect(onError).toHaveBeenCalledWith(new Error('autoplay blocked'));
    expect(session.snapshot.status).toBe('connected');
    expect(session.snapshot.isPlaying).toBe(false);
    await session.resumePlayback();
    browser.audio.onplaying?.();
    expect(session.snapshot.isPlaying).toBe(true);
  });

  it('retains exact overlapping fragments separately from conversation turns with bounded history', async () => {
    const onEvent = vi.fn();
    const session = create({ maxEvents: 2, onEvent });
    await session.connect();
    const fragments: RealtimeServerEvent[] = [
      {
        type: 'transcript-fragment',
        speaker: 'user',
        delta: ' hello ',
        startMs: 0,
        endMs: 100,
        raw: {},
      },
      {
        type: 'transcript-fragment',
        speaker: 'assistant',
        delta: 'hello',
        startMs: 50,
        endMs: 200,
        raw: {},
      },
      {
        type: 'transcript-fragment',
        speaker: 'user',
        delta: 'world',
        startMs: 90,
        endMs: 110,
        raw: {},
      },
    ];
    for (const event of fragments) await emit(event);
    expect(session.snapshot.session?.transcripts).toEqual(fragments.slice(1));
    expect(session.snapshot.messages).toEqual([]);
    expect(session.snapshot.events).toHaveLength(2);
    expect(onEvent).toHaveBeenCalledTimes(4);
  });

  it('serializes incoming asynchronous payload decoding', async () => {
    const session = create();
    await session.connect();
    const delayed = deferred<string>();
    const blob = new Blob(['']);
    vi.spyOn(blob, 'text').mockReturnValue(delayed.promise);
    channel().onmessage?.({ data: blob });
    channel().emit({ type: 'session-usage', usage: { seconds: 2 }, raw: {} });
    await flushEvents();
    expect(session.snapshot.session?.usage).toBeUndefined();
    delayed.resolve(
      JSON.stringify({ type: 'session-usage', usage: { seconds: 1 }, raw: {} }),
    );
    await flushEvents();
    expect(session.snapshot.session?.usage).toEqual({ seconds: 2 });
  });

  it('waits for final usage on close, rejects submissions, and survives throwing callbacks', async () => {
    const session = create({
      onEvent: () => {
        throw new Error('application');
      },
      onError: () => {
        throw new Error('error callback');
      },
    });
    await session.connect();
    await flushEvents();
    await emit({ type: 'session-usage', usage: { seconds: 4 }, raw: {} });
    const closed = session.close();
    expect(session.close()).toBe(closed);
    expect(session.snapshot.status).toBe('closing');
    expect(browser.track.stop).toHaveBeenCalledOnce();
    expect(() => session.sendTextMessage('late')).toThrow('not accepting');
    await flushEvents();
    expect(channel().sent).toEqual([{ type: 'session-close' }]);
    await emit({
      type: 'session-closed',
      usage: { seconds: 5 },
      reason: 'requested',
      raw: {},
    });
    await closed;
    expect(session.snapshot.session).toMatchObject({
      usage: { seconds: 5 },
      finalization: 'confirmed',
      terminationReason: 'requested',
    });
    expect(session.snapshot.status).toBe('disconnected');
    expect(browser.track.stop).toHaveBeenCalledOnce();
  });

  it('preserves final usage queued just before WebRTC data-channel closure', async () => {
    const session = create();
    await session.connect();
    await flushEvents();
    const closed = session.close();
    channel().emit({
      type: 'session-closed',
      usage: { seconds: 5 },
      reason: 'requested',
      raw: {},
    });
    channel().close();
    await closed;
    expect(session.snapshot.session?.finalization).toBe('confirmed');
    expect(session.snapshot.session?.usage).toEqual({ seconds: 5 });
  });

  it.each(['timeout', 'loss'] as const)(
    'preserves last usage with unconfirmed finalization on %s',
    async reason => {
      vi.useFakeTimers();
      const session = create({ closeTimeoutMs: 50 });
      await session.connect();
      await emit({ type: 'session-usage', usage: { seconds: 4 }, raw: {} });
      const closed = session.close();
      if (reason === 'loss') channel().close();
      else await vi.advanceTimersByTimeAsync(51);
      await closed;
      expect(session.snapshot.session).toMatchObject({
        usage: { seconds: 4 },
        finalization: 'unconfirmed',
      });
      expect(session.snapshot.isCapturing).toBe(false);
    },
  );

  it('updates mute from command acknowledgement without pretending capture stopped', async () => {
    const session = create();
    await session.connect();
    await flushEvents();
    session.sendEvent({ type: 'input-audio-mute', eventId: 'mute-1' });
    expect(session.snapshot.session?.isInputMuted).toBe(false);
    await emit({
      type: 'command-acknowledged',
      command: 'opaque-provider-command',
      clientEventId: 'mute-1',
      raw: {},
    });
    expect(session.snapshot.session?.isInputMuted).toBe(true);
    expect(session.snapshot.isCapturing).toBe(true);
    expect(browser.track.enabled).toBe(true);
    expect(() => session.sendAudio('audio')).toThrow('JSON audio');
    session.startAudioCapture(fakeStream().stream);
    await flushEvents();
    expect(
      FakePeerConnection.instances[0].sender.replaceTrack,
    ).toHaveBeenCalled();
    session.stopAudioCapture();
    await flushEvents();
    expect(session.snapshot.isCapturing).toBe(false);
  });

  it('reflects media playback and never cuts it off on user speech or backend completion', async () => {
    const session = create();
    await session.connect();
    const pc = FakePeerConnection.instances[0];
    pc.ontrack?.({ streams: [browser.stream] });
    expect(browser.audio.srcObject).toBe(browser.stream);
    expect(session.snapshot.isPlaying).toBe(false);
    browser.audio.onplaying?.();
    expect(session.snapshot.isPlaying).toBe(true);
    await emit({ type: 'speech-started', raw: {} });
    await emit(done());
    expect(browser.audio.pause).not.toHaveBeenCalled();
    expect(session.snapshot.isPlaying).toBe(true);
    browser.audio.onwaiting?.();
    expect(session.snapshot.isPlaying).toBe(false);
    await session.resumePlayback();
    expect(browser.audio.play).toHaveBeenCalledTimes(2);
  });

  it('deduplicates calls and completion snapshots and continues each response only after all outputs', async () => {
    const a = deferred<unknown>();
    const b = deferred<unknown>();
    const onToolCall = vi.fn(({ toolCall }) =>
      toolCall.toolCallId === 'a' ? a.promise : b.promise,
    );
    const session = create({ onToolCall });
    await session.connect();
    await emit(call('a'));
    await emit(call('b'));
    await emit(call('a'));
    a.resolve('first');
    await flushEvents();
    expect(channel().sent).toEqual([
      {
        type: 'backend-tool-result',
        callId: 'a',
        output: 'first',
        eventId: expect.any(String),
      },
    ]);
    await emit(done());
    expect(channel().sent).toHaveLength(1);
    b.resolve({ second: true });
    await flushEvents();
    await emit(done());
    await emit(call('b'));
    expect(onToolCall).toHaveBeenCalledTimes(2);
    expect(channel().sent).toEqual([
      {
        type: 'backend-tool-result',
        callId: 'a',
        output: 'first',
        eventId: expect.any(String),
      },
      {
        type: 'backend-tool-result',
        callId: 'b',
        output: '{"second":true}',
        eventId: expect.any(String),
      },
      { type: 'backend-response-create' },
    ]);
  });

  it('keeps concurrent response groups independent and accepts manual results', async () => {
    const session = create({ onToolCall: () => undefined });
    await session.connect();
    await emit(call('a', 'r1'));
    await emit(call('b', 'r2'));
    await emit(done('r2'));
    session.addToolOutput('a', 'one');
    session.addToolOutput('b', 'two');
    session.addToolOutput('b', 'duplicate');
    await flushEvents();
    expect(
      channel().sent.filter(e => e.type === 'backend-response-create'),
    ).toHaveLength(1);
    await emit(done('r1'));
    expect(
      channel().sent.filter(e => e.type === 'backend-response-create'),
    ).toHaveLength(2);
  });

  it('does not await pending tools to close or submit stale results after reconnect', async () => {
    const result = deferred<unknown>();
    const session = create({ onToolCall: () => result.promise });
    await session.connect();
    await emit(call('a'));
    await emit(done());
    const closed = session.close();
    await emit({
      type: 'session-closed',
      reason: 'requested',
      usage: { seconds: 1 },
      raw: {},
    });
    await closed;
    browser.getUserMedia.mockResolvedValue(fakeStream().stream);
    await session.connect();
    result.resolve('late');
    await flushEvents();
    expect(channel().sent).toEqual([]);
  });

  it('keeps async tools alive across user speech and empty terminal snapshots', async () => {
    const result = deferred<unknown>();
    const session = create({ onToolCall: () => result.promise });
    await session.connect();
    await emit(call('a'));
    await emit({ type: 'speech-started', raw: {} });
    await emit({ ...done(), raw: { output: [] } });
    result.resolve('ok');
    await flushEvents();
    expect(channel().sent).toEqual([
      {
        type: 'backend-tool-result',
        callId: 'a',
        output: 'ok',
        eventId: expect.any(String),
      },
      { type: 'backend-response-create' },
    ]);
  });
});
