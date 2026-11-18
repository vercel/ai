import type {
  Experimental_RealtimeModelV4 as RealtimeModel,
  Experimental_RealtimeModelV4Transport as RealtimeTransport,
  Experimental_RealtimeModelV4TransportOptions as TransportOptions,
} from '@ai-sdk/provider';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AbstractRealtimeSession,
  type RealtimeSessionOptions,
} from './realtime-session';
import {
  deferred,
  fakeStream,
  flushEvents,
} from './__fixtures__/fake-realtime';

class Session extends AbstractRealtimeSession {
  get snapshot() {
    return this.state;
  }
  protected setState() {}
}

const sessions: Session[] = [];

function setup(options: Partial<RealtimeSessionOptions> = {}) {
  let callbacks: TransportOptions;
  let signal: AbortSignal;
  const transport = {
    connect: vi.fn(async args => {
      signal = args.abortSignal;
      await callbacks.onEvent({
        type: 'session-created',
        sessionId: 'session',
        raw: {},
      });
      callbacks.onCapturing(args.capture !== false);
    }),
    sendEvent: vi.fn(async () => {}),
    startCapture: vi.fn(async () => callbacks.onCapturing(true)),
    stopCapture: vi.fn(async () => callbacks.onCapturing(false)),
    stopPlayback: vi.fn(() => callbacks.onPlaying(false)),
    resumePlayback: vi.fn(async () => callbacks.onPlaying(true)),
    finish: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    dispose: vi.fn(),
  } satisfies RealtimeTransport;
  const model: RealtimeModel = {
    specificationVersion: 'v4',
    provider: 'test',
    modelId: 'test',
    capabilities: {
      conversation: 'turn-based',
      transports: ['webrtc'],
      connections: ['provider'],
    },
    createTransport: next => {
      callbacks = next;
      return transport;
    },
    parseServerEvent: vi.fn(),
    serializeClientEvent: vi.fn(),
    buildSessionConfig: vi.fn(),
  };
  const onError = vi.fn();
  const session = new Session({
    model,
    api: { provider: '/provider-session' },
    onError,
    ...options,
  });
  sessions.push(session);
  return {
    session,
    model,
    transport,
    onError,
    callbacks: () => callbacks!,
    signal: () => signal!,
  };
}

afterEach(() => {
  sessions.splice(0).forEach(session => session.dispose());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('provider-owned realtime transport', () => {
  it('delegates setup and media without creating built-in transports', async () => {
    const fetch = vi.fn();
    const WebSocket = vi.fn();
    const RTCPeerConnection = vi.fn();
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('WebSocket', WebSocket);
    vi.stubGlobal('RTCPeerConnection', RTCPeerConnection);
    const config = { instructions: 'Be concise' };
    const { session, transport, callbacks } = setup({ sessionConfig: config });
    const { stream } = fakeStream();
    await session.connect({ stream, capture: false });
    expect(transport.connect).toHaveBeenCalledWith({
      api: '/provider-session',
      sessionConfig: config,
      stream,
      capture: false,
      abortSignal: expect.any(AbortSignal),
    });
    expect(session.snapshot.status).toBe('connected');
    expect(session.snapshot.isCapturing).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    expect(WebSocket).not.toHaveBeenCalled();
    expect(RTCPeerConnection).not.toHaveBeenCalled();
    await callbacks().onEvent({
      type: 'input-transcription-completed',
      itemId: 'user',
      transcript: 'Hello',
      raw: {},
    });
    expect(session.snapshot.messages[0]).toMatchObject({
      role: 'user',
      parts: [{ type: 'text', text: 'Hello' }],
    });
    session.startAudioCapture(stream);
    await flushEvents();
    expect(transport.startCapture).toHaveBeenCalledWith(stream);
    expect(session.snapshot.isCapturing).toBe(true);
    session.stopAudioCapture();
    expect(session.snapshot.isCapturing).toBe(false);
    await session.resumePlayback();
    expect(session.snapshot.isPlaying).toBe(true);
    session.stopPlayback();
    expect(session.snapshot.isPlaying).toBe(false);
  });

  it('waits for provider cleanup and closes once', async () => {
    const { session, transport, signal } = setup();
    const cleanup = deferred<void>();
    transport.close.mockReturnValue(cleanup.promise);
    await session.connect();
    const closed = session.close();
    expect(session.close()).toBe(closed);
    expect(session.snapshot.status).toBe('closing');
    expect(transport.close).toHaveBeenCalledOnce();
    expect(transport.dispose).not.toHaveBeenCalled();
    cleanup.resolve();
    await closed;
    expect(session.snapshot.status).toBe('disconnected');
    expect(signal().aborted).toBe(true);
    expect(transport.dispose).toHaveBeenCalledOnce();
  });

  it('reports cleanup failures and releases local resources', async () => {
    const { session, transport, onError } = setup();
    const error = new Error('Session deletion failed');
    transport.close.mockRejectedValue(error);
    await session.connect();
    await session.close();
    expect(onError).toHaveBeenCalledWith(error);
    expect(transport.dispose).toHaveBeenCalledOnce();
    expect(session.snapshot.status).toBe('disconnected');
  });

  it('aborts pending setup and ignores late callbacks after disconnect', async () => {
    const { session, transport, callbacks } = setup();
    const pending = deferred<void>();
    let signal: AbortSignal | undefined;
    transport.connect.mockImplementation(async args => {
      signal = args.abortSignal;
      await pending.promise;
    });
    const connecting = session.connect();
    session.disconnect();
    expect(signal?.aborted).toBe(true);
    expect(transport.dispose).toHaveBeenCalledOnce();
    await callbacks().onEvent({
      type: 'session-created',
      sessionId: 'late',
      raw: {},
    });
    callbacks().onCapturing(true);
    pending.resolve();
    await connecting;
    expect(session.snapshot.status).toBe('disconnected');
    expect(session.snapshot.isCapturing).toBe(false);
  });

  it('bounds startup and cleanup when a provider never settles', async () => {
    vi.useFakeTimers();
    const { session, transport, onError } = setup({ startupTimeoutMs: 100 });
    const pending = deferred<void>();
    transport.connect.mockReturnValue(pending.promise);
    const connecting = session.connect();
    await vi.advanceTimersByTimeAsync(100);
    expect(session.snapshot.status).toBe('error');
    expect(onError.mock.calls[0][0].message).toContain('startup timed out');
    expect(transport.dispose).toHaveBeenCalledOnce();
    pending.resolve();
    await connecting;
  });

  it('closes during setup and does not allow the startup timeout to interrupt cleanup', async () => {
    vi.useFakeTimers();
    const { session, transport, onError } = setup({
      startupTimeoutMs: 100,
      closeTimeoutMs: 200,
    });
    const pending = deferred<void>();
    const cleanup = deferred<void>();
    transport.connect.mockReturnValue(pending.promise);
    transport.close.mockReturnValue(cleanup.promise);
    const connecting = session.connect();
    const closed = session.close();
    await vi.advanceTimersByTimeAsync(100);
    expect(onError).not.toHaveBeenCalled();
    expect(session.snapshot.status).toBe('closing');
    await vi.advanceTimersByTimeAsync(100);
    await closed;
    expect(session.snapshot.status).toBe('error');
    expect(onError.mock.calls[0][0].message).toContain('cleanup timed out');
    pending.resolve();
    cleanup.resolve();
    await connecting;
  });

  it('lets the provider continue after tool output without sending response-create', async () => {
    const { session, transport, callbacks } = setup({
      onToolCall: () => ({ temperature: 21 }),
    });
    await session.connect();
    await callbacks().onEvent({
      type: 'function-call-arguments-delta',
      responseId: 'call',
      callId: 'call',
      itemId: 'call',
      delta: '',
      raw: {},
    });
    await callbacks().onEvent({
      type: 'function-call-arguments-done',
      responseId: 'call',
      callId: 'call',
      itemId: 'call',
      name: 'weather',
      arguments: '{}',
      raw: {},
    });
    await flushEvents();
    expect(transport.sendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'conversation-item-create',
        item: expect.objectContaining({
          type: 'function-call-output',
          callId: 'call',
          output: '{"temperature":21}',
        }),
      }),
      expect.any(Function),
    );
    expect(transport.sendEvent).toHaveBeenCalledTimes(1);
  });

  it('rejects incompatible setup before constructing a transport', async () => {
    const { session, transport, onError } = setup({ api: { token: '/token' } });
    await session.connect();
    expect(transport.connect).not.toHaveBeenCalled();
    expect(onError.mock.calls[0][0].message).toContain(
      'does not support client-secret-websocket',
    );
  });

  it('reports asynchronous command failures and rejects the send promise', async () => {
    const { session, transport, onError } = setup();
    const error = new Error('Provider update failed');
    transport.sendEvent.mockRejectedValue(error);
    await session.connect();
    await expect(
      session.sendEvent({ type: 'session-update', config: {} }),
    ).rejects.toBe(error);
    expect(onError).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(error);
    expect(session.snapshot.status).toBe('connected');
  });
});
