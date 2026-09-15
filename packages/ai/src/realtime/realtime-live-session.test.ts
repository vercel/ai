import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RealtimeServerEvent } from '../types/realtime-model';
import {
  AbstractRealtimeSession,
  type RealtimeSessionOptions,
  type RealtimeState,
} from './realtime-session';
import {
  deferred,
  FakePeerConnection,
  FakeTrack,
  fakeStream,
  flushEvents,
  installWebRTC,
  liveModel,
} from './__fixtures__/fake-webrtc';

class Session extends AbstractRealtimeSession {
  onPublish?: (key: keyof RealtimeState) => void;
  get snapshot() {
    return this.state;
  }
  protected setState(key: keyof RealtimeState) {
    this.onPublish?.(key);
  }
}

describe('client-delegated WebRTC sessions', () => {
  let browser: ReturnType<typeof installWebRTC>;
  const sessions: Session[] = [];
  const create = (options: Partial<RealtimeSessionOptions> = {}) => {
    const session = new Session({
      model: liveModel(),
      api: { session: '/api/session' },
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

  beforeEach(() => {
    browser = installWebRTC();
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
    expect(() =>
      session.sendEvent({
        type: 'context-append',
        content: 'too soon',
        delegationId: null,
      }),
    ).toThrow('not accepting');
    await expect(session.connect()).rejects.toThrow('already active');
    await emit({
      type: 'session-started',
      sessionId: 'ready',
      delegationMode: 'client',
      raw: {},
    });
    await session.sendEvent({
      type: 'context-append',
      content: 'hello',
      delegationId: null,
    });
    await flushEvents();
    expect(channel().sent).toEqual([
      {
        type: 'context-append',
        content: 'hello',
        delegationId: null,
      },
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
    expect(() =>
      session.sendEvent({
        type: 'context-append',
        content: 'late',
        delegationId: null,
      }),
    ).toThrow('not accepting');
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

  it('reflects media playback and never cuts it off on user speech or custom response events', async () => {
    const session = create();
    await session.connect();
    const pc = FakePeerConnection.instances[0];
    pc.ontrack?.({ streams: [browser.stream] });
    expect(browser.audio.srcObject).toBe(browser.stream);
    expect(session.snapshot.isPlaying).toBe(false);
    browser.audio.onplaying?.();
    expect(session.snapshot.isPlaying).toBe(true);
    await emit({ type: 'speech-started', raw: {} });
    await emit({
      type: 'custom',
      rawType: 'response.event',
      raw: { type: 'response.event', event: { type: 'response.completed' } },
    });
    expect(browser.audio.pause).not.toHaveBeenCalled();
    expect(session.snapshot.isPlaying).toBe(true);
    browser.audio.onwaiting?.();
    expect(session.snapshot.isPlaying).toBe(false);
    await session.resumePlayback();
    expect(browser.audio.play).toHaveBeenCalledTimes(2);
  });

  it('leaves client delegation handling and context submission to the application', async () => {
    const onToolCall = vi.fn();
    const onEvent = vi.fn();
    const session = create({ onToolCall, onEvent });
    await session.connect();
    await emit({
      type: 'delegation-created',
      delegationId: 'd1',
      target: 'client',
      raw: {},
    });
    await emit({
      type: 'custom',
      rawType: 'response.event',
      raw: {
        type: 'response.event',
        event: { type: 'response.output_item.done' },
      },
    });
    expect(onToolCall).not.toHaveBeenCalled();
    expect(channel().sent).toEqual([]);
    expect(session.snapshot.messages).toEqual([]);
    expect(session.snapshot.session?.delegations).toHaveLength(1);
    await session.sendEvent({
      type: 'context-append',
      content: 'Application result',
      delegationId: 'd1',
      eventId: 'context-1',
    });
    await emit({
      type: 'command-acknowledged',
      clientEventId: 'context-1',
      command: 'session.thinking.append',
      raw: {},
    });
    expect(channel().sent).toEqual([
      {
        type: 'context-append',
        content: 'Application result',
        delegationId: 'd1',
        eventId: 'context-1',
      },
    ]);
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'command-acknowledged' }),
    );
  });

  it('honors stop capture during initial microphone acquisition and negotiates a reusable sender', async () => {
    const media = deferred<MediaStream>();
    browser.getUserMedia.mockReturnValueOnce(media.promise);
    const session = create();
    const connecting = session.connect();
    session.stopAudioCapture();
    media.resolve(browser.stream);
    await connecting;
    expect(browser.track.stop).toHaveBeenCalledOnce();
    expect(session.snapshot.isCapturing).toBe(false);
    expect(session.snapshot.status).toBe('connected');
    expect(FakePeerConnection.instances[0].addTrack).not.toHaveBeenCalled();
    expect(
      FakePeerConnection.instances[0].addTransceiver,
    ).toHaveBeenCalledExactlyOnceWith('audio', { direction: 'sendrecv' });
  });

  it('keeps a transiently disconnected peer alive, cancels grace on recovery, and expires once', async () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    const session = create({ onError, rtcDisconnectTimeoutMs: 500 });
    await session.connect();
    const pc = FakePeerConnection.instances[0];
    pc.connectionState = 'disconnected';
    pc.onconnectionstatechange?.();
    await vi.advanceTimersByTimeAsync(499);
    expect(session.snapshot.status).toBe('connected');
    expect(browser.track.stop).not.toHaveBeenCalled();
    pc.connectionState = 'connected';
    pc.onconnectionstatechange?.();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(onError).not.toHaveBeenCalled();
    pc.connectionState = 'disconnected';
    pc.onconnectionstatechange?.();
    await vi.advanceTimersByTimeAsync(501);
    expect(onError).toHaveBeenCalledExactlyOnceWith(
      new Error('Realtime peer disconnected beyond recovery grace period'),
    );
    expect(session.snapshot.status).toBe('error');
    expect(browser.track.stop).toHaveBeenCalledOnce();
    expect(pc.close).toHaveBeenCalledOnce();
  });

  it.each(['ice', 'data-channel'] as const)(
    'reports pre-open %s failure once even when onError throws',
    async kind => {
      FakePeerConnection.autoOpen = false;
      FakePeerConnection.autoStart = false;
      const onError = vi.fn(() => {
        throw new Error('application callback');
      });
      const session = create({ onError });
      const connecting = session.connect();
      await flushEvents();
      const pc = FakePeerConnection.instances[0];
      if (kind === 'ice') {
        pc.iceConnectionState = 'failed';
        pc.oniceconnectionstatechange?.();
      } else pc.dc.close();
      await connecting;
      expect(onError).toHaveBeenCalledExactlyOnceWith(
        new Error(
          kind === 'ice'
            ? 'Realtime ICE connection failed'
            : 'Realtime data channel closed',
        ),
      );
      expect(session.snapshot.status).toBe('error');
      expect(browser.track.stop).toHaveBeenCalledOnce();
      expect(pc.close).toHaveBeenCalledOnce();
    },
  );

  it.each(['before-close', 'during-close'] as const)(
    'drains a queued terminal Blob %s with exactly one normalized final event',
    async timing => {
      const onError = vi.fn();
      const onEvent = vi.fn();
      const session = create({ onError, onEvent });
      await session.connect();
      const terminal = deferred<string>();
      const blob = new Blob();
      vi.spyOn(blob, 'text').mockReturnValue(terminal.promise);
      const closed = timing === 'during-close' ? session.close() : undefined;
      channel().onmessage?.({ data: blob });
      channel().close();
      expect(session.snapshot.status).toBe('closing');
      expect(session.snapshot.isCapturing).toBe(false);
      expect(onError).not.toHaveBeenCalled();
      terminal.resolve(
        JSON.stringify({
          type: 'session-closed',
          usage: { seconds: 9 },
          reason: 'requested',
          raw: {},
        }),
      );
      await flushEvents();
      await closed;
      expect(session.snapshot.status).toBe('disconnected');
      expect(session.snapshot.session).toMatchObject({
        finalization: 'confirmed',
        usage: { seconds: 9 },
      });
      expect(onError).not.toHaveBeenCalled();
      expect(
        onEvent.mock.calls.filter(([event]) => event.type === 'session-closed'),
      ).toHaveLength(1);
      expect(browser.track.stop).toHaveBeenCalledOnce();
      expect(FakePeerConnection.instances[0].close).toHaveBeenCalledOnce();
    },
  );

  it.each(['empty', 'blocked'] as const)(
    'reports unexpected closure once after %s drain and ignores late terminal events',
    async drain => {
      vi.useFakeTimers();
      const onError = vi.fn(() => {
        throw new Error('application callback');
      });
      const session = create({ onError });
      await session.connect();
      const terminal = deferred<string>();
      if (drain === 'blocked') {
        const blob = new Blob();
        vi.spyOn(blob, 'text').mockReturnValue(terminal.promise);
        channel().onmessage?.({ data: blob });
      }
      channel().close();
      await flushEvents();
      if (drain === 'blocked') {
        await vi.advanceTimersByTimeAsync(999);
        expect(onError).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
      }
      expect(onError).toHaveBeenCalledExactlyOnceWith(
        new Error('Realtime data channel closed'),
      );
      expect(session.snapshot.status).toBe('error');
      expect(session.snapshot.session?.finalization).toBe('unconfirmed');
      expect(FakePeerConnection.instances[0].close).toHaveBeenCalledOnce();
      terminal.resolve(
        JSON.stringify({
          type: 'session-closed',
          usage: { seconds: 99 },
          reason: 'requested',
          raw: {},
        }),
      );
      await vi.advanceTimersByTimeAsync(20_000);
      expect(session.snapshot.session?.finalization).toBe('unconfirmed');
      expect(onError).toHaveBeenCalledOnce();
    },
  );

  it('preserves failed ICE as the cause even when queued terminal usage is confirmed', async () => {
    const onError = vi.fn();
    const session = create({ onError });
    await session.connect();
    channel().emit({
      type: 'session-closed',
      usage: { seconds: 9 },
      reason: 'requested',
      raw: {},
    });
    const pc = FakePeerConnection.instances[0];
    pc.iceConnectionState = 'failed';
    pc.oniceconnectionstatechange?.();
    await flushEvents();
    expect(session.snapshot.session?.finalization).toBe('confirmed');
    expect(session.snapshot.status).toBe('error');
    expect(onError).toHaveBeenCalledExactlyOnceWith(
      new Error('Realtime ICE connection failed'),
    );
  });

  it('supports borrowed reattachment after receive-only setup and detaches on close', async () => {
    const session = create();
    await session.connect({ capture: false });
    expect(browser.getUserMedia).not.toHaveBeenCalled();
    session.startAudioCapture(browser.stream);
    await flushEvents();
    session.stopAudioCapture();
    await flushEvents();
    expect(session.snapshot.isCapturing).toBe(false);
    await session.resumeAudioCapture();
    expect(session.snapshot.isCapturing).toBe(true);
    const closed = session.close();
    await flushEvents();
    expect(session.snapshot.isCapturing).toBe(false);
    expect(
      FakePeerConnection.instances[0].sender.replaceTrack,
    ).toHaveBeenLastCalledWith(null);
    await emit({
      type: 'session-closed',
      usage: { seconds: 1 },
      reason: 'requested',
      raw: {},
    });
    await closed;
    expect(browser.track.stop).not.toHaveBeenCalled();
    expect(browser.track.enabled).toBe(true);
  });

  it('rejects provider delegation explicitly before publishing readiness', async () => {
    FakePeerConnection.autoStart = false;
    const onError = vi.fn();
    const session = create({ onError });
    await session.connect();
    await emit({
      type: 'session-started',
      sessionId: 'unsupported',
      delegationMode: 'provider',
      raw: {},
    });
    expect(session.snapshot.status).toBe('error');
    expect(session.snapshot.session?.sessionId).toBeUndefined();
    expect(browser.track.stop).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0][0].message).toContain(
      'client delegation only',
    );
  });

  it('uses explicit lifecycle capabilities for turn-based RTC without inferring provider delegation', async () => {
    const model = liveModel();
    const session = create({
      model: {
        ...model,
        capabilities: { ...model.capabilities, conversation: 'turn-based' },
      },
    });
    await session.connect({ capture: false });
    expect(session.snapshot.status).toBe('connected');
    expect(session.snapshot.session?.delegationMode).toBe('client');
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

  it('isolates failed close draining and stale media callbacks from an onError reconnect', async () => {
    vi.useFakeTimers();
    const serialized = deferred<void>();
    const inbound = deferred<string>();
    const model = liveModel();
    model.serializeClientEvent = async event => {
      if (event.type === 'session-close') {
        await serialized.promise;
        throw new Error('close serialization failed');
      }
      return event;
    };
    const onError = vi.fn();
    const session = create({ model, onError });
    await session.connect();
    const pc = FakePeerConnection.instances[0];
    const onPlaying = browser.audio.onplaying;
    const onTrack = pc.ontrack;
    const blob = new Blob();
    vi.spyOn(blob, 'text').mockReturnValue(inbound.promise);
    channel().onmessage?.({ data: blob });
    let reconnecting: Promise<void> | undefined;
    onError.mockImplementationOnce(() => {
      session.disconnect();
      reconnecting = session.connect({ capture: false });
    });
    const closed = session.close();
    await flushEvents();
    serialized.resolve();
    await flushEvents();
    await reconnecting;
    await closed;
    inbound.resolve(
      JSON.stringify({
        type: 'session-closed',
        usage: { seconds: 99 },
        reason: 'requested',
        raw: {},
      }),
    );
    onPlaying?.();
    onTrack?.({ streams: [browser.stream] });
    await vi.advanceTimersByTimeAsync(20_000);
    expect(session.snapshot.status).toBe('connected');
    expect(session.snapshot.isPlaying).toBe(false);
    expect(session.snapshot.session?.finalization).toBe('pending');
    expect(session.snapshot.session?.usage).toBeUndefined();
    expect(pc.close).toHaveBeenCalledOnce();
    expect(FakePeerConnection.instances[1].close).not.toHaveBeenCalled();
    await session.sendEvent({
      type: 'input-audio-mute',
      eventId: 'new-attempt',
    });
    expect(channel().sent).toEqual([
      { type: 'input-audio-mute', eventId: 'new-attempt' },
    ]);
    expect(onError).toHaveBeenCalledOnce();
  });

  it.each(['configuration', 'parser'] as const)(
    'abandons old RTC setup when provider %s construction reconnects',
    async phase => {
      const model = liveModel();
      const session = create({ model });
      let reconnecting: Promise<void> | undefined;
      let replaced = false;
      const reconnect = () => {
        if (replaced) return;
        replaced = true;
        session.disconnect();
        reconnecting = session.connect({ capture: false });
      };
      if (phase === 'configuration')
        model.getWebRTCConfig = () => {
          reconnect();
          return { dataChannelLabel: 'model-events' };
        };
      else
        model.createServerEventParser = () => {
          reconnect();
          return raw => raw as RealtimeServerEvent;
        };
      await session.connect({ capture: false });
      await reconnecting;
      expect(browser.fetch).toHaveBeenCalledOnce();
      expect(browser.getUserMedia).not.toHaveBeenCalled();
      const peers = FakePeerConnection.instances;
      expect(peers).toHaveLength(phase === 'configuration' ? 1 : 2);
      if (phase === 'parser') {
        expect(peers[0].close).toHaveBeenCalledOnce();
        expect(peers[0].createOffer).not.toHaveBeenCalled();
      }
      expect(peers.at(-1)?.close).not.toHaveBeenCalled();
      expect(session.snapshot.status).toBe('connected');
    },
  );

  it('does not negotiate an old sender after a capture subscriber disconnects', async () => {
    const session = create();
    session.onPublish = key => {
      if (key === 'isCapturing' && session.snapshot.isCapturing)
        session.disconnect();
    };
    await session.connect();
    expect(session.snapshot.status).toBe('disconnected');
    expect(FakePeerConnection.instances[0].createOffer).not.toHaveBeenCalled();
    expect(browser.fetch).not.toHaveBeenCalled();
    expect(browser.track.stop).toHaveBeenCalledOnce();
  });

  it('honors a reentrant capture stop while replacing an attached microphone', async () => {
    const session = create();
    await session.connect();
    session.onPublish = key => {
      if (key === 'isCapturing' && !session.snapshot.isCapturing)
        session.stopAudioCapture();
    };
    await session.resumeAudioCapture();
    expect(browser.getUserMedia).toHaveBeenCalledOnce();
    expect(browser.track.stop).toHaveBeenCalledOnce();
    expect(FakePeerConnection.instances[0].sender.track).toBeNull();
    expect(session.snapshot.isCapturing).toBe(false);
  });

  it('selects the active second track once and observes only the transmitted track', async () => {
    const disabled = new FakeTrack();
    disabled.enabled = false;
    const active = new FakeTrack();
    const { stream } = fakeStream([disabled, active]);
    const session = create();
    await session.connect({ stream });
    const pc = FakePeerConnection.instances[0];
    expect(pc.addTrack).toHaveBeenCalledExactlyOnceWith(active, stream);
    expect(session.snapshot.isCapturing).toBe(true);
    disabled.enabled = true;
    active.muted = true;
    active.dispatchEvent(new Event('mute'));
    expect(session.snapshot.isCapturing).toBe(false);
    expect(pc.sender.track).toBe(active);
    expect(pc.sender.replaceTrack).not.toHaveBeenCalled();
    disabled.dispatchEvent(new Event('unmute'));
    expect(session.snapshot.isCapturing).toBe(false);
    active.muted = false;
    active.dispatchEvent(new Event('unmute'));
    expect(session.snapshot.isCapturing).toBe(true);
    active.readyState = 'ended';
    active.dispatchEvent(new Event('ended'));
    expect(session.snapshot.isCapturing).toBe(false);
    session.disconnect();
    expect(disabled.stop).not.toHaveBeenCalled();
    expect(active.stop).not.toHaveBeenCalled();
    expect(disabled.enabled).toBe(true);
    expect(active.enabled).toBe(true);
  });

  it.each(['disabled', 'muted'] as const)(
    'reports a single %s transmitted track as inactive',
    async state => {
      if (state === 'disabled') browser.track.enabled = false;
      else browser.track.muted = true;
      const session = create();
      await session.connect({ stream: browser.stream });
      expect(FakePeerConnection.instances[0].sender.track).toBe(browser.track);
      expect(session.snapshot.isCapturing).toBe(false);
      session.disconnect();
      expect(browser.track.stop).not.toHaveBeenCalled();
      expect(browser.track.enabled).toBe(state !== 'disabled');
    },
  );

  it('refreshes silently changed borrowed tracks only through explicit capture controls', async () => {
    const session = create();
    await session.connect({ stream: browser.stream });
    const pc = FakePeerConnection.instances[0];
    expect(session.snapshot.isCapturing).toBe(true);

    browser.track.enabled = false;
    await flushEvents();
    expect(session.snapshot.isCapturing).toBe(true);
    await session.resumeAudioCapture();
    expect(session.snapshot.isCapturing).toBe(false);
    expect(pc.sender.track).toBe(browser.track);
    expect(browser.track.enabled).toBe(false);

    browser.track.enabled = true;
    await flushEvents();
    expect(session.snapshot.isCapturing).toBe(false);
    await session.resumeAudioCapture();
    expect(session.snapshot.isCapturing).toBe(true);
    expect(pc.sender.track).toBe(browser.track);

    browser.track.stop();
    await flushEvents();
    expect(session.snapshot.isCapturing).toBe(true);
    await expect(session.resumeAudioCapture()).rejects.toThrow(
      'live audio track',
    );
    expect(session.snapshot.isCapturing).toBe(false);
    expect(pc.sender.track).toBeNull();

    const disabled = new FakeTrack();
    disabled.enabled = false;
    const active = new FakeTrack();
    session.startAudioCapture(
      fakeStream([browser.track, disabled, active]).stream,
    );
    await flushEvents();
    expect(pc.sender.track).toBe(active);
    expect(session.snapshot.isCapturing).toBe(true);
    expect(browser.getUserMedia).not.toHaveBeenCalled();
    expect(browser.fetch).toHaveBeenCalledOnce();
    session.disconnect();
    expect(browser.track.stop).toHaveBeenCalledOnce();
    expect(disabled.stop).not.toHaveBeenCalled();
    expect(active.stop).not.toHaveBeenCalled();
    expect(disabled.enabled).toBe(false);
    expect(active.enabled).toBe(true);
  });

  it('uses the same active-track selection when attaching capture after receive-only setup', async () => {
    const session = create();
    await session.connect({ capture: false });
    const muted = new FakeTrack();
    muted.muted = true;
    const active = new FakeTrack();
    session.startAudioCapture(fakeStream([muted, active]).stream);
    await flushEvents();
    const pc = FakePeerConnection.instances[0];
    expect(pc.sender.replaceTrack).toHaveBeenLastCalledWith(active);
    expect(session.snapshot.isCapturing).toBe(true);
    active.readyState = 'ended';
    active.dispatchEvent(new Event('ended'));
    expect(session.snapshot.isCapturing).toBe(false);
    session.disconnect();
    expect(muted.stop).not.toHaveBeenCalled();
    expect(active.stop).not.toHaveBeenCalled();
  });
});
