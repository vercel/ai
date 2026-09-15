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
