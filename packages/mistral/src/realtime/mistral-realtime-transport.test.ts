import type {
  Experimental_RealtimeModelV4ServerEvent as ServerEvent,
  Experimental_RealtimeModelV4TransportOptions as TransportOptions,
} from '@ai-sdk/provider';
import type { LocalAudioTrack, RpcInvocationData } from 'livekit-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MistralRealtimeTransport,
  parseMistralRealtimeEvent,
} from './mistral-realtime-transport';

const livekit = vi.hoisted(() => {
  const agent = { identity: 'mistral-agent', isAgent: true };
  class Room {
    static instances: Room[] = [];
    static withAgent = true;
    listeners = new Map<string, Set<(...args: any[]) => void>>();
    remoteParticipants = new Map(
      Room.withAgent ? [[agent.identity, agent]] : [],
    );
    rpc = new Map<string, (data: RpcInvocationData) => Promise<string>>();
    localParticipant = {
      publishTrack: vi.fn(async () => {}),
      unpublishTrack: vi.fn(async () => {}),
      registerRpcMethod: vi.fn(
        (name: string, handler: (data: RpcInvocationData) => Promise<string>) =>
          this.rpc.set(name, handler),
      ),
      performRpc: vi.fn(async () => '{"type":"session.updated"}'),
    };
    connect = vi.fn(async () => {});
    disconnect = vi.fn(async () => {});
    startAudio = vi.fn(async () => {});
    constructor() {
      Room.instances.push(this);
    }
    on(name: string, callback: (...args: any[]) => void) {
      const handlers = this.listeners.get(name) ?? new Set();
      handlers.add(callback);
      this.listeners.set(name, handlers);
    }
    off(name: string, callback: (...args: any[]) => void) {
      this.listeners.get(name)?.delete(callback);
    }
    emit(name: string, ...args: any[]) {
      for (const callback of this.listeners.get(name) ?? []) callback(...args);
    }
  }
  return { Room, agent, createLocalAudioTrack: vi.fn() };
});

vi.mock('livekit-client', () => ({
  Room: livekit.Room,
  createLocalAudioTrack: livekit.createLocalAudioTrack,
  Track: { Kind: { Audio: 'audio' }, Source: { Microphone: 'microphone' } },
  RoomEvent: {
    ParticipantConnected: 'participant-connected',
    ParticipantDisconnected: 'participant-disconnected',
    Disconnected: 'disconnected',
    Reconnecting: 'reconnecting',
    Reconnected: 'reconnected',
    TrackSubscribed: 'track-subscribed',
    TrackUnsubscribed: 'track-unsubscribed',
    DataReceived: 'data-received',
  },
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function fakeMicrophone() {
  const track = Object.assign(new EventTarget(), {
    kind: 'audio',
    enabled: true,
    muted: false,
    readyState: 'live',
    stop: vi.fn(),
  });
  const stream = { getAudioTracks: () => [track] } as unknown as MediaStream;
  const local = {
    mediaStreamTrack: track,
    stop: vi.fn(() => track.stop()),
  } as unknown as LocalAudioTrack;
  return { track, stream, local };
}

async function flush() {
  for (let i = 0; i < 30; ++i) await Promise.resolve();
}

describe('Mistral LiveKit browser transport', () => {
  const transports: MistralRealtimeTransport[] = [];
  const credentials = {
    id: 'session/1',
    participantToken: 'participant-token',
    serverUrl: 'wss://voice.example.com',
  };
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
  let microphone: ReturnType<typeof fakeMicrophone>;

  function create(overrides: Partial<TransportOptions> = {}) {
    const callbacks = {
      onEvent: vi.fn<TransportOptions['onEvent']>(overrides.onEvent),
      onError: vi.fn(overrides.onError),
      onFatalError: vi.fn(overrides.onFatalError),
      onClose: vi.fn(overrides.onClose),
      onCapturing: vi.fn(overrides.onCapturing),
      onPlaying: vi.fn(overrides.onPlaying),
    };
    const transport = new MistralRealtimeTransport(callbacks);
    transports.push(transport);
    return { transport, ...callbacks };
  }
  function connect(transport: MistralRealtimeTransport, capture = false) {
    return transport.connect({
      api: '/api/mistral-realtime',
      capture,
      abortSignal: new AbortController().signal,
    });
  }
  function receive(
    payload: unknown,
    participant = livekit.agent,
    topic = 'voice_agent.events',
  ) {
    livekit.Room.instances[0].emit(
      'data-received',
      new TextEncoder().encode(JSON.stringify(payload)),
      participant,
      undefined,
      topic,
    );
  }

  beforeEach(() => {
    livekit.Room.instances = [];
    livekit.Room.withAgent = true;
    microphone = fakeMicrophone();
    livekit.createLocalAudioTrack.mockReset();
    livekit.createLocalAudioTrack.mockResolvedValue(microphone.local);
    fetchMock = vi.fn<typeof fetch>(async (_url, init) =>
      init?.method === 'DELETE'
        ? new Response(null, { status: 204 })
        : Response.json(credentials),
    );
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(async () => {
    await Promise.all(transports.splice(0).map(transport => transport.close()));
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('does not open a room or acquire media until connect', () => {
    create();
    expect(livekit.Room.instances).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(livekit.createLocalAudioTrack).not.toHaveBeenCalled();
  });

  it('creates a session through the application and connects with its credentials', async () => {
    const { transport, onEvent } = create();
    await transport.connect({
      api: '/api/mistral-realtime',
      sessionConfig: { instructions: 'Keep answers short.' },
      capture: false,
      abortSignal: new AbortController().signal,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/mistral-realtime',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          sessionConfig: { instructions: 'Keep answers short.' },
        }),
      }),
    );
    expect(livekit.Room.instances[0].connect).toHaveBeenCalledWith(
      credentials.serverUrl,
      credentials.participantToken,
    );
    expect(onEvent).toHaveBeenCalledExactlyOnceWith({
      type: 'session-created',
      sessionId: credentials.id,
      raw: { type: 'session.created', id: credentials.id },
    });
  });

  it('waits for the agent before marking the session ready', async () => {
    livekit.Room.withAgent = false;
    const { transport, onEvent } = create();
    const connecting = connect(transport);
    await vi.waitFor(() => expect(livekit.Room.instances).toHaveLength(1));
    await flush();
    expect(onEvent).not.toHaveBeenCalled();
    livekit.Room.instances[0].remoteParticipants.set(
      livekit.agent.identity,
      livekit.agent,
    );
    livekit.Room.instances[0].emit('participant-connected', livekit.agent);
    await connecting;
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'session-created' }),
    );
  });

  it('publishes microphone audio and releases owned media on close', async () => {
    const { transport, onClose, onCapturing } = create();
    await connect(transport, true);
    const room = livekit.Room.instances[0];
    expect(room.localParticipant.publishTrack).toHaveBeenCalledWith(
      microphone.track,
      { source: 'microphone' },
    );
    expect(onCapturing).toHaveBeenLastCalledWith(true);
    await transport.close();
    expect(microphone.local.stop).toHaveBeenCalledOnce();
    expect(room.disconnect).toHaveBeenCalledWith(false);
    expect(onClose).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/mistral-realtime?sessionId=session%2F1',
      { method: 'DELETE', keepalive: true },
    );
    await transport.close();
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE'),
    ).toHaveLength(1);
  });

  it('never stops caller-owned microphone tracks', async () => {
    const { transport } = create();
    await transport.connect({
      api: '/api/mistral-realtime',
      stream: microphone.stream,
      abortSignal: new AbortController().signal,
    });
    await transport.stopCapture();
    expect(
      livekit.Room.instances[0].localParticipant.unpublishTrack,
    ).toHaveBeenCalledWith(microphone.track, false);
    await transport.startCapture();
    await transport.close();
    expect(microphone.track.stop).not.toHaveBeenCalled();
    expect(livekit.createLocalAudioTrack).not.toHaveBeenCalled();
  });

  it('keeps cleanup idempotent when a media callback closes again', async () => {
    const { transport } = create({
      onCapturing: value => {
        if (!value) transport.dispose();
      },
    });
    await connect(transport);
    await transport.close();
    expect(livekit.Room.instances[0].disconnect).toHaveBeenCalledOnce();
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE'),
    ).toHaveLength(1);
  });

  it('deletes a session returned after cancellation of its POST', async () => {
    const response = deferred<Response>();
    fetchMock.mockImplementationOnce(() => response.promise);
    const abort = new AbortController();
    const { transport, onEvent } = create();
    const connecting = transport.connect({
      api: '/api/mistral-realtime',
      abortSignal: abort.signal,
    });
    const rejected = expect(connecting).rejects.toThrow('closed');
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    abort.abort();
    const closed = vi.fn();
    const closing = transport.close().then(closed);
    await flush();
    expect(closed).not.toHaveBeenCalled();
    response.resolve(Response.json(credentials));
    await rejected;
    await closing;
    expect(livekit.Room.instances).toHaveLength(0);
    expect(livekit.createLocalAudioTrack).not.toHaveBeenCalled();
    expect(onEvent).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/mistral-realtime?sessionId=session%2F1',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('closes while microphone permission is pending and stops a late owned track', async () => {
    const media = deferred<LocalAudioTrack>();
    livekit.createLocalAudioTrack.mockReturnValueOnce(media.promise);
    const { transport, onEvent } = create();
    const connecting = connect(transport, true);
    const rejected = expect(connecting).rejects.toThrow('cancelled');
    await vi.waitFor(() =>
      expect(livekit.createLocalAudioTrack).toHaveBeenCalledOnce(),
    );
    await transport.close();
    await rejected;
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringContaining('sessionId='),
      expect.objectContaining({ method: 'DELETE' }),
    );
    media.resolve(microphone.local);
    await flush();
    expect(microphone.local.stop).toHaveBeenCalledOnce();
    expect(
      livekit.Room.instances[0].localParticipant.publishTrack,
    ).not.toHaveBeenCalled();
    expect(onEvent).not.toHaveBeenCalled();
  });

  it('cleans up a session when microphone acquisition fails', async () => {
    livekit.createLocalAudioTrack.mockRejectedValueOnce(
      new Error('Microphone permission denied'),
    );
    const { transport } = create();
    await expect(connect(transport, true)).rejects.toThrow('permission denied');
    expect(livekit.Room.instances[0].disconnect).toHaveBeenCalledWith(false);
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringContaining('sessionId='),
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('maps final transcripts without accumulating revised partial text or duplicate finals', async () => {
    const { transport, onEvent } = create();
    await connect(transport);
    for (const [content, final] of [
      ['I scream', false],
      ['Ice cream', false],
      ['Ice cream.', true],
      ['Ice cream.', true],
    ] as const) {
      receive({
        type: 'transcription.segment',
        id: 'user-1',
        role: 'user',
        content,
        final,
      });
    }
    receive({
      type: 'transcription.segment',
      id: 'assistant-1',
      role: 'assistant',
      content: 'Which flavor?',
      final: true,
    });
    await transport.finish();
    expect(onEvent.mock.calls.map(([event]) => event.type)).toEqual([
      'session-created',
      'input-transcription-completed',
      'response-created',
      'audio-transcript-delta',
      'audio-transcript-done',
      'response-done',
    ]);
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ transcript: 'Ice cream.' }),
    );
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ transcript: 'Which flavor?' }),
    );
  });

  it('ignores data from other topics and non-agent participants', async () => {
    const { transport, onEvent } = create();
    await connect(transport);
    receive({ type: 'session.updated' }, livekit.agent, 'other-topic');
    receive({ type: 'session.updated' }, { identity: 'user', isAgent: false });
    await transport.finish();
    expect(onEvent).toHaveBeenCalledOnce();
  });

  it('routes client tool execution through normalized events and returns the submitted output', async () => {
    const { transport, onEvent } = create();
    onEvent.mockImplementation(async event => {
      if (event.type === 'function-call-arguments-done') {
        await transport.sendEvent({
          type: 'conversation-item-create',
          item: {
            type: 'function-call-output',
            callId: event.callId,
            output: '{"temperature":20}',
          },
        });
      }
    });
    await connect(transport);
    const invoke = livekit.Room.instances[0].rpc.get('mistral.function_tool')!;
    await expect(
      invoke({
        requestId: 'rpc-1',
        callerIdentity: livekit.agent.identity,
        payload: '{"name":"weather","arguments":{"city":"Paris"}}',
        responseTimeout: 5000,
      }),
    ).resolves.toBe('{"temperature":20}');
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'function-call-arguments-done',
        name: 'weather',
        callId: 'rpc-1',
        arguments: '{"city":"Paris"}',
      }),
    );
    expect(
      onEvent.mock.calls.some(([event]) => event.type === 'response-done'),
    ).toBe(false);
  });

  it('rejects tool RPCs from participants other than the agent', async () => {
    const { transport, onEvent } = create();
    await connect(transport);
    const invoke = livekit.Room.instances[0].rpc.get('mistral.function_tool')!;
    await expect(
      invoke({
        requestId: 'rpc-1',
        callerIdentity: 'another-client',
        payload: '{"name":"weather"}',
        responseTimeout: 5000,
      }),
    ).rejects.toThrow('Only the Mistral voice agent');
    expect(onEvent).toHaveBeenCalledOnce();
  });

  it('rejects pending tool results when closed', async () => {
    const { transport, onEvent } = create();
    await connect(transport);
    const pending = livekit.Room.instances[0].rpc.get('mistral.function_tool')!(
      {
        requestId: 'rpc-1',
        callerIdentity: livekit.agent.identity,
        payload: '{"name":"weather"}',
        responseTimeout: 5000,
      },
    );
    const rejected = expect(pending).rejects.toThrow('session closed');
    await vi.waitFor(() => expect(onEvent).toHaveBeenCalledTimes(3));
    await transport.close();
    await rejected;
  });

  it('sends supported updates through RPC and rejects voice changes', async () => {
    const { transport } = create();
    await connect(transport);
    await transport.sendEvent({
      type: 'session-update',
      config: { instructions: 'Speak French.' },
    });
    expect(
      livekit.Room.instances[0].localParticipant.performRpc,
    ).toHaveBeenCalledWith({
      destinationIdentity: livekit.agent.identity,
      method: 'mistral.session_update',
      payload: '{"instructions":"Speak French."}',
      responseTimeout: 5000,
    });
    await expect(
      transport.sendEvent({
        type: 'session-update',
        config: { voice: 'different-voice' },
      }),
    ).rejects.toThrow('live update of voice');
  });

  it('rejects unsupported input and response commands synchronously', async () => {
    const { transport } = create();
    await connect(transport);
    expect(() => transport.sendEvent({ type: 'response-create' })).toThrow();
    expect(() =>
      transport.sendEvent({
        type: 'input-audio-append',
        audio: 'AAAA',
      }),
    ).toThrow();
    expect(() =>
      transport.sendEvent({
        type: 'conversation-item-create',
        item: { type: 'text-message', role: 'user', text: 'Hi' },
      }),
    ).toThrow();
  });

  it('plays agent tracks and removes playback resources on close', async () => {
    const { transport, onPlaying } = create();
    await connect(transport);
    const element = {
      play: vi.fn(async () => {}),
      pause: vi.fn(),
      remove: vi.fn(),
      srcObject: {},
    };
    const track = {
      kind: 'audio',
      attach: vi.fn(() => element),
      detach: vi.fn(),
    };
    livekit.Room.instances[0].emit(
      'track-subscribed',
      track,
      {},
      livekit.agent,
    );
    expect(element.play).toHaveBeenCalledOnce();
    receive({ type: 'agent.state.changed', state: 'speaking' });
    await flush();
    expect(onPlaying).toHaveBeenLastCalledWith(true);
    transport.stopPlayback();
    expect(element.pause).toHaveBeenCalledOnce();
    await transport.resumePlayback();
    expect(element.play).toHaveBeenCalledTimes(2);
    await transport.close();
    expect(element.srcObject).toBeNull();
    expect(element.remove).toHaveBeenCalledOnce();
    expect(track.detach).toHaveBeenCalledWith(element);
    expect(onPlaying).toHaveBeenLastCalledWith(false);
  });

  it('cleans up after a fatal agent error', async () => {
    const { transport, onFatalError } = create();
    await connect(transport);
    receive({
      type: 'error',
      message: 'The speech model failed.',
      code: 'tts_failed',
      fatal: true,
    });
    await vi.waitFor(() => expect(onFatalError).toHaveBeenCalledOnce());
    await transport.close();
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringContaining('sessionId='),
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('allows the agent to rejoin while LiveKit reconnects', async () => {
    const { transport, onFatalError } = create();
    await connect(transport);
    const room = livekit.Room.instances[0];
    room.emit('reconnecting');
    room.remoteParticipants.delete(livekit.agent.identity);
    room.emit('participant-disconnected', livekit.agent);
    await flush();
    expect(onFatalError).not.toHaveBeenCalled();
    expect(room.disconnect).not.toHaveBeenCalled();
    room.remoteParticipants.set(livekit.agent.identity, livekit.agent);
    room.emit('participant-connected', livekit.agent);
    room.emit('reconnected');
    await flush();
    expect(onFatalError).not.toHaveBeenCalled();
  });

  it('closes if the agent remains absent after reconnection', async () => {
    const { transport, onFatalError } = create();
    await connect(transport);
    const room = livekit.Room.instances[0];
    room.emit('reconnecting');
    room.remoteParticipants.delete(livekit.agent.identity);
    room.emit('participant-disconnected', livekit.agent);
    await flush();
    room.emit('reconnected');
    await vi.waitFor(() => expect(onFatalError).toHaveBeenCalledOnce());
    await transport.close();
    expect(room.disconnect).toHaveBeenCalledWith(false);
  });

  it('drains accepted events before finish resolves', async () => {
    const delivery = deferred<void>();
    const events: ServerEvent[] = [];
    const { transport } = create({
      onEvent: async event => {
        if (event.type === 'session-updated') await delivery.promise;
        events.push(event);
      },
    });
    await connect(transport);
    receive({ type: 'session.updated' });
    const finished = vi.fn();
    const finishing = transport.finish().then(finished);
    await flush();
    expect(finished).not.toHaveBeenCalled();
    receive({ type: 'ignored-after-finish' });
    delivery.resolve();
    await finishing;
    expect(events.map(event => event.type)).toEqual([
      'session-created',
      'session-updated',
    ]);
  });
});

describe('parseMistralRealtimeEvent', () => {
  it('preserves unknown provider events without inventing response commands', () => {
    const raw = { type: 'tool_call.ended', id: 'call-1', result: 'done' };
    expect(parseMistralRealtimeEvent(raw)).toEqual([
      { type: 'custom', rawType: 'tool_call.ended', raw },
    ]);
  });
});
