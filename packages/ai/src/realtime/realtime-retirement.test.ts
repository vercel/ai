import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AbstractRealtimeSession,
  type RealtimeSessionOptions,
  type RealtimeState,
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
  publish = vi.fn<(key: keyof RealtimeState) => void>();
  retireForCommit(): void {
    this.retireCurrentAttempt();
  }
  get snapshot() {
    return this.state;
  }
  protected setState<K extends keyof RealtimeState>(key: K): void {
    this.publish(key);
  }
}

const toolDone: RealtimeServerEvent = {
  type: 'function-call-arguments-done',
  responseId: 'response',
  itemId: 'tool',
  callId: 'call',
  name: 'lookup',
  arguments: '{}',
  raw: {},
};
const audio = encodeRealtimeAudio(new Float32Array(240));

describe('non-notifying commit-phase realtime retirement', () => {
  let browser: ReturnType<typeof installLiveWebSocket>;
  const sessions: Session[] = [];
  const create = (
    profile: 'legacy' | 'continuous',
    options: Partial<RealtimeSessionOptions> = {},
  ) => {
    const model =
      profile === 'legacy'
        ? {
            ...liveModel(),
            capabilities: undefined,
            getWebSocketConfig: ({ url }: { url: string }) => ({ url }),
          }
        : liveModel();
    const onError = vi.fn();
    const onEvent = vi.fn();
    const onToolCall = vi.fn();
    const session = new Session({
      model,
      api:
        profile === 'legacy'
          ? { token: '/token' }
          : { websocket: 'wss://relay.test' },
      onError,
      onEvent,
      onToolCall,
      ...options,
    });
    sessions.push(session);
    return { session, model, onError, onEvent, onToolCall };
  };
  const socket = () => {
    const ws = FakeWebSocket.instances.at(-1);
    if (ws == null) throw new Error('Expected a socket');
    return ws;
  };
  const ready = async (session: Session, profile: 'legacy' | 'continuous') => {
    await session.connect({ capture: false });
    socket().open();
    socket().emit(
      profile === 'legacy'
        ? { type: 'session-created', sessionId: 's', raw: {} }
        : {
            type: 'session-started',
            sessionId: 's',
            delegationMode: 'client',
            raw: {},
          },
    );
    await flushEvents();
  };
  const clearNotifications = (value: ReturnType<typeof create>) => {
    value.session.publish.mockClear();
    value.onError.mockClear();
    value.onEvent.mockClear();
    value.onToolCall.mockClear();
  };
  const expectSilent = (value: ReturnType<typeof create>) => {
    expect(value.session.publish).not.toHaveBeenCalled();
    expect(value.onError).not.toHaveBeenCalled();
    expect(value.onEvent).not.toHaveBeenCalled();
    expect(value.onToolCall).not.toHaveBeenCalled();
  };
  beforeEach(() => {
    browser = installLiveWebSocket();
    browser.fetch.mockImplementation(async () =>
      Response.json({ token: 'secret', url: 'wss://provider.test' }),
    );
  });
  afterEach(() => {
    sessions.forEach(session => {
      session.publish.mockReset();
      session.dispose();
    });
    sessions.length = 0;
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each(['legacy', 'continuous'] as const)(
    'fences %s input, microphone and playback callbacks without disposing or notifying',
    async profile => {
      vi.useFakeTimers();
      const value = create(profile);
      const { session, model } = value;
      const parse = vi.spyOn(model, 'parseServerEvent');
      await ready(session, profile);
      await session.resumeAudioCapture();
      await session.resumePlayback();
      socket().emit(
        profile === 'legacy'
          ? {
              type: 'audio-delta',
              responseId: 'r',
              itemId: 'a',
              delta: audio,
              raw: {},
            }
          : { type: 'audio-chunk', delta: audio, raw: {} },
      );
      await flushEvents();
      const ws = socket();
      const playback = FakeAudioContext.instances[0] as FakeAudioContext & {
        onstatechange?: () => void;
      };
      const capture = FakeAudioContext.instances[1];
      const source = playback.sources[0];
      const health = vi.fn(() => ({ pong: true }));
      model.getHealthCheckResponse = health;
      const aborted = vi.fn();
      const signal = browser.fetch.mock.calls[0]?.[1]?.signal;
      signal?.addEventListener('abort', aborted);
      clearNotifications(value);
      parse.mockClear();
      ws.send.mockClear();
      const snapshot = session.snapshot;
      session.retireForCommit();
      session.retireForCommit();
      expectSilent(value);
      expect(session.snapshot).toBe(snapshot);
      expect(ws.close).not.toHaveBeenCalled();
      expect(browser.track.stop).not.toHaveBeenCalled();
      expect(aborted).not.toHaveBeenCalled();
      const getSamples = vi.fn(() => new Float32Array(1024));
      capture.processors[0].onaudioprocess?.({
        inputBuffer: { getChannelData: getSamples },
      });
      browser.track.dispatchEvent(new Event('mute'));
      playback.onstatechange?.();
      source.onended?.();
      ws.emit({ type: 'audio-chunk', delta: audio, raw: {} });
      ws.emit(toolDone);
      ws.onmessage?.({ data: '{' });
      ws.onmessage?.({ data: '{"ping":true}' });
      ws.onerror?.();
      ws.closeFromServer({ code: 1006, wasClean: false });
      ws.open();
      await vi.advanceTimersByTimeAsync(31_000);
      expectSilent(value);
      expect(session.snapshot).toBe(snapshot);
      expect(parse).not.toHaveBeenCalled();
      expect(health).not.toHaveBeenCalled();
      expect(getSamples).not.toHaveBeenCalled();
      expect(ws.send).not.toHaveBeenCalled();
      expect(ws.close).not.toHaveBeenCalled();
      expect(source.disconnect).not.toHaveBeenCalled();
      expect(source.stop).not.toHaveBeenCalled();
      expect(playback.close).not.toHaveBeenCalled();
      expect(capture.close).not.toHaveBeenCalled();
      expect(browser.track.stop).not.toHaveBeenCalled();
      expect(() => session.sendEvent({ type: 'response-create' })).toThrow(
        'not accepting',
      );
      session.dispose();
      expect(ws.close).toHaveBeenCalledOnce();
      expect(playback.close).toHaveBeenCalledOnce();
      expect(capture.close).toHaveBeenCalledOnce();
      expect(browser.track.stop).toHaveBeenCalledOnce();
      expect(aborted).toHaveBeenCalledTimes(profile === 'legacy' ? 1 : 0);
      expect(session.snapshot.status).toBe('disconnected');
    },
  );

  it.each(['legacy', 'continuous'] as const)(
    'fences pending %s serialization, including automatic audio and ignored send promises',
    async profile => {
      const value = create(profile);
      await ready(value.session, profile);
      await value.session.resumeAudioCapture();
      const pending = deferred<void>();
      const toJSON = vi.fn(() => ({ old: true }));
      const serialize = vi.fn(async () => {
        await pending.promise;
        return { toJSON };
      });
      value.model.serializeClientEvent = serialize;
      const sent = value.session.sendEvent({ type: 'response-create' });
      const rejected = expect(sent).rejects.toThrow('closed');
      await flushEvents();
      FakeAudioContext.instances[1].processors[0].onaudioprocess?.({
        inputBuffer: { getChannelData: () => new Float32Array(1024) },
      });
      void value.session.sendEvent({ type: 'response-create' });
      clearNotifications(value);
      socket().send.mockClear();
      value.session.retireForCommit();
      pending.resolve();
      await rejected;
      await flushEvents();
      expect(serialize).toHaveBeenCalledOnce();
      expect(toJSON).not.toHaveBeenCalled();
      expect(socket().send).not.toHaveBeenCalled();
      expect(socket().close).not.toHaveBeenCalled();
      expectSilent(value);
    },
  );

  it.each(['legacy', 'continuous'] as const)(
    'discards accepted delayed %s health and playback frames at retirement',
    async profile => {
      const value = create(profile);
      const parse = vi.spyOn(value.model, 'parseServerEvent');
      await ready(value.session, profile);
      parse.mockClear();
      const text = deferred<string>();
      const blob = new Blob();
      vi.spyOn(blob, 'text').mockReturnValue(text.promise);
      const health = vi.fn(() => ({ pong: true }));
      value.model.getHealthCheckResponse = health;
      socket().onmessage?.({ data: blob });
      socket().emit({ type: 'audio-chunk', delta: audio, raw: {} });
      await flushEvents();
      clearNotifications(value);
      socket().send.mockClear();
      value.session.retireForCommit();
      text.resolve('{"ping":true}');
      await flushEvents();
      expect(parse).not.toHaveBeenCalled();
      expect(health).not.toHaveBeenCalled();
      expect(socket().send).not.toHaveBeenCalled();
      expect(FakeAudioContext.instances[0].sources).toHaveLength(0);
      expectSilent(value);
    },
  );

  it.each(['serialize', 'encode', 'health'] as const)(
    'checks retirement after the %s user-code boundary',
    async boundary => {
      const value = create('continuous');
      await ready(value.session, 'continuous');
      clearNotifications(value);
      socket().send.mockClear();
      const retire = () => {
        value.session.retireForCommit();
        return { old: true };
      };
      if (boundary === 'health') {
        value.model.getHealthCheckResponse = retire;
        socket().onmessage?.({ data: '{"ping":true}' });
      } else {
        value.model.serializeClientEvent =
          boundary === 'serialize' ? retire : () => ({ toJSON: retire });
        const sending = value.session.sendEvent({ type: 'response-create' });
        await expect(sending).rejects.toThrow('closed');
      }
      await flushEvents();
      expect(socket().send).not.toHaveBeenCalled();
      expect(socket().close).not.toHaveBeenCalled();
      expectSilent(value);
    },
  );

  it.each(['resolve', 'reject'] as const)(
    'ignores a legacy tool %s after retirement without disposal',
    async outcome => {
      const pending = deferred<void>();
      const handler = vi.fn(async () => {
        await pending.promise;
        if (outcome === 'reject') throw new Error('late tool error');
        return 'old output';
      });
      const value = create('legacy', { onToolCall: handler });
      await ready(value.session, 'legacy');
      socket().emit(toolDone);
      await flushEvents();
      expect(handler).toHaveBeenCalledOnce();
      clearNotifications(value);
      socket().send.mockClear();
      value.session.retireForCommit();
      pending.resolve();
      socket().emit(toolDone);
      await flushEvents();
      expect(handler).toHaveBeenCalledOnce();
      expect(socket().send).not.toHaveBeenCalled();
      expectSilent(value);
    },
  );

  it.each(['legacy', 'continuous'] as const)(
    'releases a late owned %s microphone without resuming capture or notifying',
    async profile => {
      const value = create(profile);
      await ready(value.session, profile);
      const media = deferred<MediaStream>();
      browser.getUserMedia.mockReturnValueOnce(media.promise);
      const capturing = value.session.resumeAudioCapture();
      clearNotifications(value);
      const snapshot = value.session.snapshot;
      value.session.retireForCommit();
      expect(browser.track.stop).not.toHaveBeenCalled();
      media.resolve(browser.stream);
      await capturing;
      expect(browser.track.stop).toHaveBeenCalledOnce();
      expect(FakeAudioContext.instances).toHaveLength(1);
      expect(value.session.snapshot).toBe(snapshot);
      expectSilent(value);
      value.session.dispose();
      expect(browser.track.stop).toHaveBeenCalledOnce();
    },
  );

  it.each(['legacy', 'continuous'] as const)(
    'keeps %s supplied-stream ownership unchanged until passive disposal',
    async profile => {
      const value = create(profile);
      await ready(value.session, profile);
      value.session.startAudioCapture(browser.stream);
      await flushEvents();
      clearNotifications(value);
      value.session.retireForCommit();
      expect(browser.track.stop).not.toHaveBeenCalled();
      expectSilent(value);
      value.session.dispose();
      expect(browser.track.stop).toHaveBeenCalledTimes(
        profile === 'legacy' ? 1 : 0,
      );
    },
  );

  it('retires preconnect legacy audio without callbacks and permits reuse after disposal', async () => {
    const value = create('legacy');
    value.session.startAudioCapture(browser.stream);
    clearNotifications(value);
    value.session.retireForCommit();
    browser.track.dispatchEvent(new Event('mute'));
    await flushEvents();
    expectSilent(value);
    expect(browser.track.stop).not.toHaveBeenCalled();
    expect(() => value.session.startAudioCapture(browser.stream)).toThrow(
      'not accepting',
    );
    value.session.dispose();
    expect(browser.track.stop).toHaveBeenCalledOnce();
    const next = fakeStream();
    value.session.startAudioCapture(next.stream);
    expect(value.session.snapshot.isCapturing).toBe(true);
    value.session.dispose();
    expect(next.track.stop).toHaveBeenCalledOnce();
  });

  it('defers setup abort and ignores startup deadlines and late setup responses', async () => {
    vi.useFakeTimers();
    const setup = deferred<Response>();
    browser.fetch.mockReturnValueOnce(setup.promise);
    const value = create('legacy', { startupTimeoutMs: 10 });
    const connecting = value.session.connect();
    const signal = browser.fetch.mock.calls[0][1]?.signal;
    const aborted = vi.fn();
    signal?.addEventListener('abort', aborted);
    clearNotifications(value);
    value.session.retireForCommit();
    await vi.advanceTimersByTimeAsync(11);
    expect(aborted).not.toHaveBeenCalled();
    expect(signal?.aborted).toBe(false);
    const response = Response.json({
      token: 'secret',
      url: 'wss://provider.test',
    });
    const read = vi.spyOn(response, 'json');
    setup.resolve(response);
    await connecting;
    expect(read).not.toHaveBeenCalled();
    expect(FakeWebSocket.instances).toHaveLength(0);
    expectSilent(value);
    value.session.dispose();
    expect(aborted).toHaveBeenCalledOnce();
    expect(signal?.aborted).toBe(true);
  });

  it('ignores a pending socket-open failure after retirement without closing the socket', async () => {
    const value = create('continuous');
    const pending = deferred<void>();
    value.model.serializeClientEvent = async () => {
      await pending.promise;
      throw new Error('late startup failure');
    };
    await value.session.connect({ capture: false });
    socket().open();
    await flushEvents();
    clearNotifications(value);
    value.session.retireForCommit();
    pending.resolve();
    await flushEvents();
    expect(socket().close).not.toHaveBeenCalled();
    expectSilent(value);
  });

  it('suppresses pending automatic microphone errors after retirement', async () => {
    const value = create('continuous');
    const pending = deferred<void>();
    browser.getUserMedia.mockImplementationOnce(async () => {
      await pending.promise;
      throw new Error('late permission denial');
    });
    await value.session.connect();
    socket().open();
    socket().emit({ type: 'session-started', sessionId: 's', raw: {} });
    await flushEvents();
    expect(browser.getUserMedia).toHaveBeenCalledOnce();
    clearNotifications(value);
    value.session.retireForCommit();
    pending.resolve();
    await flushEvents();
    expectSilent(value);
    expect(socket().close).not.toHaveBeenCalled();
  });

  it('keeps a retired manual-audio rejection silent even after passive disposal', async () => {
    const value = create('legacy');
    await ready(value.session, 'legacy');
    const pending = deferred<void>();
    value.model.serializeClientEvent = async () => {
      await pending.promise;
      throw new Error('late audio rejection');
    };
    value.session.sendAudio(audio);
    await flushEvents();
    value.session.retireForCommit();
    value.session.dispose();
    clearNotifications(value);
    pending.resolve();
    await flushEvents();
    expectSilent(value);
  });

  it('defers close settlement and drain cleanup until passive disposal', async () => {
    vi.useFakeTimers();
    const value = create('continuous', { closeTimeoutMs: 10 });
    await ready(value.session, 'continuous');
    const text = deferred<string>();
    const blob = new Blob();
    vi.spyOn(blob, 'text').mockReturnValue(text.promise);
    socket().onmessage?.({ data: blob });
    const closed = value.session.close();
    const settled = vi.fn();
    void closed.then(settled);
    socket().closeFromServer();
    clearNotifications(value);
    value.session.retireForCommit();
    text.resolve(
      JSON.stringify({
        type: 'session-closed',
        usage: { seconds: 9 },
        raw: {},
      }),
    );
    await vi.advanceTimersByTimeAsync(2_000);
    expect(settled).not.toHaveBeenCalled();
    expect(FakeAudioContext.instances[0].close).not.toHaveBeenCalled();
    expectSilent(value);
    value.session.dispose();
    await closed;
    expect(settled).toHaveBeenCalledOnce();
    expect(value.session.snapshot.session?.finalization).toBe('unconfirmed');
  });

  it('fences the remainder of an event publication and its playback effects', async () => {
    const value = create('continuous');
    await ready(value.session, 'continuous');
    clearNotifications(value);
    value.session.publish.mockImplementationOnce(() =>
      value.session.retireForCommit(),
    );
    socket().emit({ type: 'audio-chunk', delta: audio, raw: {} });
    await flushEvents();
    expect(value.session.publish).toHaveBeenCalledOnce();
    expect(value.onEvent).not.toHaveBeenCalled();
    expect(value.onError).not.toHaveBeenCalled();
    expect(FakeAudioContext.instances[0].sources).toHaveLength(0);
    expect(FakeAudioContext.instances[0].close).not.toHaveBeenCalled();
  });

  it.each(['dispose', 'connect'] as const)(
    'cleans up retired resources on %s and reuses the base session',
    async cleanup => {
      const value = create('legacy');
      await ready(value.session, 'legacy');
      const old = socket();
      const media = deferred<MediaStream>();
      browser.getUserMedia.mockReturnValueOnce(media.promise);
      const capturing = value.session.resumeAudioCapture();
      const signal = browser.fetch.mock.calls[0][1]?.signal;
      value.session.retireForCommit();
      if (cleanup === 'dispose') value.session.dispose();
      await ready(value.session, 'legacy');
      const next = fakeStream();
      value.session.startAudioCapture(next.stream);
      media.resolve(browser.stream);
      await capturing;
      expect(browser.track.stop).toHaveBeenCalledOnce();
      expect(next.track.stop).not.toHaveBeenCalled();
      expect(signal?.aborted).toBe(true);
      expect(old.close).toHaveBeenCalledOnce();
      expect(socket()).not.toBe(old);
      expect(socket().close).not.toHaveBeenCalled();
      await value.session.sendEvent({ type: 'response-create' });
      expect(value.session.snapshot.status).toBe('connected');
      expect(value.session.snapshot.isCapturing).toBe(true);
    },
  );

  it('allows an abort listener to reconnect only during passive cleanup of a retired attempt', async () => {
    const value = create('legacy');
    await ready(value.session, 'legacy');
    const old = socket();
    let replacement: Promise<void> | undefined;
    const reconnect = vi.fn(() => {
      replacement = value.session.connect();
    });
    browser.fetch.mock.calls[0][1]?.signal?.addEventListener(
      'abort',
      reconnect,
    );
    value.session.retireForCommit();
    expect(reconnect).not.toHaveBeenCalled();
    value.session.dispose();
    await replacement;
    expect(reconnect).toHaveBeenCalledOnce();
    expect(old.close).toHaveBeenCalledOnce();
    expect(socket()).not.toBe(old);
    expect(socket().close).not.toHaveBeenCalled();
    socket().open();
    socket().emit({ type: 'session-created', sessionId: 'new', raw: {} });
    await flushEvents();
    expect(value.session.snapshot.status).toBe('connected');
  });
});
