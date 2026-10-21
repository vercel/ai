import {
  UnsupportedFunctionalityError,
  type Experimental_RealtimeModelV4ClientEvent as ClientEvent,
  type Experimental_RealtimeModelV4ServerEvent as ServerEvent,
  type Experimental_RealtimeModelV4Transport as RealtimeTransport,
  type Experimental_RealtimeModelV4TransportOptions as TransportOptions,
} from '@ai-sdk/provider';
import { safeParseJSON } from '@ai-sdk/provider-utils';
import type {
  LocalAudioTrack,
  RemoteParticipant,
  RemoteTrack,
  Room,
  RpcInvocationData,
} from 'livekit-client';
import { z } from 'zod/v4';
import { buildMistralRealtimeSessionConfig } from './mistral-realtime-model-options';

const sessionSchema = z.object({
  id: z.string().min(1),
  participantToken: z.string().min(1),
  serverUrl: z.string().min(1),
});
const transcriptSchema = z.object({
  type: z.literal('transcription.segment'),
  id: z.string(),
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  final: z.boolean(),
});
const errorSchema = z.object({
  type: z.literal('error'),
  message: z.string(),
  code: z.string(),
  fatal: z.boolean(),
});
const functionCallSchema = z.object({
  name: z.string(),
  arguments: z.record(z.string(), z.unknown()).optional(),
});

/** Voice transcripts contain replacement text, rather than append-only deltas. */
export function parseMistralRealtimeEvent(raw: unknown): ServerEvent[] {
  const type =
    raw != null && typeof raw === 'object' && 'type' in raw
      ? raw.type
      : undefined;
  switch (type) {
    case 'transcription.segment': {
      const segment = transcriptSchema.parse(raw);
      if (!segment.final) return [];
      return segment.role === 'user'
        ? [
            {
              type: 'input-transcription-completed',
              itemId: segment.id,
              transcript: segment.content,
              raw,
            },
          ]
        : [
            { type: 'response-created', responseId: segment.id, raw },
            {
              type: 'audio-transcript-delta',
              responseId: segment.id,
              itemId: segment.id,
              delta: segment.content,
              raw,
            },
            {
              type: 'audio-transcript-done',
              responseId: segment.id,
              itemId: segment.id,
              transcript: segment.content,
              raw,
            },
            {
              type: 'response-done',
              responseId: segment.id,
              status: 'completed',
              raw,
            },
          ];
    }
    case 'session.updated':
      return [{ type: 'session-updated', raw }];
    case 'error': {
      const error = errorSchema.parse(raw);
      return [{ type: 'error', message: error.message, code: error.code, raw }];
    }
    default:
      return [
        {
          type: 'custom',
          rawType: typeof type === 'string' ? type : 'unknown',
          raw,
        },
      ];
  }
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/** LiveKit stays inside the Mistral provider and is loaded only on connection. */
export class MistralRealtimeTransport implements RealtimeTransport {
  private room?: Room;
  private session?: z.infer<typeof sessionSchema>;
  private api?: string;
  private started = false;
  private closed = false;
  private accepting = true;
  private ready = false;
  private failed = false;
  private reconnecting = false;
  private agentDisconnected = false;
  private agentCheckQueued = false;
  private abort = new AbortController();
  private setup?: Promise<void>;
  private cleanup?: Promise<void>;
  private removeAbortListener?: () => void;
  private removeRoomListeners?: () => void;
  private resolveAgent?: () => void;
  private incoming = Promise.resolve();
  private deliveries = Promise.resolve();
  private pendingEvents: ServerEvent[] = [];
  private pendingCount = 0;
  private pendingBytes = 0;
  private finalizedSegments = new Set<string>();
  private captureVersion = 0;
  private captureOperations = Promise.resolve();
  private sourceStream?: MediaStream;
  private ownedTracks = new Set<LocalAudioTrack>();
  private microphone?: {
    track: MediaStreamTrack;
    owned?: LocalAudioTrack;
    removeListener: () => void;
  };
  private playbackEnabled = true;
  private agentSpeaking = false;
  private remoteAudio = new Map<RemoteTrack, HTMLMediaElement>();
  private pendingTools = new Map<
    string,
    {
      resolve: (result: string) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();

  constructor(private readonly options: TransportOptions) {}

  async connect({
    api,
    sessionConfig,
    stream,
    capture = true,
    abortSignal,
  }: Parameters<RealtimeTransport['connect']>[0]): Promise<void> {
    if (this.started || this.closed)
      throw new Error('Create a new Mistral transport for each connection.');
    this.started = true;
    this.api = api;
    const onAbort = () => this.dispose();
    abortSignal.addEventListener('abort', onAbort, { once: true });
    this.removeAbortListener = () =>
      abortSignal.removeEventListener('abort', onAbort);
    if (abortSignal.aborted) {
      this.dispose();
      throw new Error('Mistral voice connection cancelled.');
    }

    this.setup = this.open({ sessionConfig, stream, capture });
    try {
      await this.setup;
    } catch (error) {
      await this.close().catch(cleanupError =>
        this.options.onError(asError(cleanupError)),
      );
      throw error;
    }
  }

  private async open({
    sessionConfig,
    stream,
    capture,
  }: Pick<
    Parameters<RealtimeTransport['connect']>[0],
    'sessionConfig' | 'stream' | 'capture'
  >): Promise<void> {
    const livekit = await import('livekit-client');
    this.assertOpen();
    // Let an in-flight create request finish on cancellation, so its returned
    // session can still be deleted. A bounded timeout covers an unresponsive app.
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), 30_000);
    try {
      const response = await fetch(this.api!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionConfig }),
        signal: timeout.signal,
      });
      if (!response.ok)
        throw new Error(
          `Failed to create Mistral voice session: ${response.status}`,
        );
      const parsed = await safeParseJSON({
        text: await response.text(),
        schema: sessionSchema,
      });
      if (!parsed.success) throw parsed.error;
      this.session = parsed.value;
    } finally {
      clearTimeout(timer);
    }
    this.assertOpen();

    const room = new livekit.Room();
    this.room = room;
    const agentReady = new Promise<void>(resolve => {
      this.resolveAgent = resolve;
    });
    const onParticipantConnected = (participant: RemoteParticipant) => {
      if (participant.isAgent) {
        this.agentDisconnected = false;
        this.resolveAgent?.();
      }
    };
    const onParticipantDisconnected = (participant: RemoteParticipant) => {
      if (participant.isAgent) {
        this.agentDisconnected = true;
        this.checkAgentDisconnect();
      }
    };
    const onReconnecting = () => {
      this.reconnecting = true;
    };
    const onReconnected = () => {
      this.reconnecting = false;
      this.checkAgentDisconnect();
    };
    const onDisconnected = () => {
      if (!this.closed)
        this.fail(new Error('Mistral voice connection disconnected.'));
    };
    const onTrackSubscribed = (
      track: RemoteTrack,
      _publication: unknown,
      participant: RemoteParticipant,
    ) => {
      if (
        this.closed ||
        !participant.isAgent ||
        track.kind !== livekit.Track.Kind.Audio
      )
        return;
      const element = track.attach();
      this.remoteAudio.set(track, element);
      if (this.playbackEnabled) {
        void element.play().catch(error => {
          if (!this.closed) this.options.onError(asError(error));
        });
      } else element.pause();
    };
    const onTrackUnsubscribed = (track: RemoteTrack) => {
      this.removeRemoteTrack(track);
    };
    const onDataReceived = (
      payload: Uint8Array,
      participant?: RemoteParticipant,
      _kind?: unknown,
      topic?: string,
    ) => {
      if (topic !== 'voice_agent.events' || !participant?.isAgent) return;
      this.receive(payload);
    };
    room.on(livekit.RoomEvent.ParticipantConnected, onParticipantConnected);
    room.on(
      livekit.RoomEvent.ParticipantDisconnected,
      onParticipantDisconnected,
    );
    room.on(livekit.RoomEvent.Disconnected, onDisconnected);
    room.on(livekit.RoomEvent.Reconnecting, onReconnecting);
    room.on(livekit.RoomEvent.Reconnected, onReconnected);
    room.on(livekit.RoomEvent.TrackSubscribed, onTrackSubscribed);
    room.on(livekit.RoomEvent.TrackUnsubscribed, onTrackUnsubscribed);
    room.on(livekit.RoomEvent.DataReceived, onDataReceived);
    this.removeRoomListeners = () => {
      room.off(livekit.RoomEvent.ParticipantConnected, onParticipantConnected);
      room.off(
        livekit.RoomEvent.ParticipantDisconnected,
        onParticipantDisconnected,
      );
      room.off(livekit.RoomEvent.Disconnected, onDisconnected);
      room.off(livekit.RoomEvent.Reconnecting, onReconnecting);
      room.off(livekit.RoomEvent.Reconnected, onReconnected);
      room.off(livekit.RoomEvent.TrackSubscribed, onTrackSubscribed);
      room.off(livekit.RoomEvent.TrackUnsubscribed, onTrackUnsubscribed);
      room.off(livekit.RoomEvent.DataReceived, onDataReceived);
    };
    const connecting = room.connect(
      this.session.serverUrl,
      this.session.participantToken,
    );
    void connecting.then(
      () => {
        if (this.closed) void room.disconnect(false).catch(() => {});
      },
      () => {},
    );
    await this.untilAborted(connecting);
    this.assertOpen();
    room.localParticipant.registerRpcMethod(
      'mistral.function_tool',
      (data: RpcInvocationData) => this.handleToolCall(data),
    );
    if (this.findAgent() != null) this.resolveAgent?.();
    if (capture) await this.untilAborted(this.startCapture(stream));
    await this.untilAborted(agentReady);
    this.assertOpen();
    await this.options.onEvent({
      type: 'session-created',
      sessionId: this.session.id,
      raw: { type: 'session.created', id: this.session.id },
    });
    this.assertOpen();
    this.ready = true;
    const events = this.pendingEvents.splice(0);
    await Promise.all(events.map(event => this.emit(event)));
  }

  sendEvent(event: ClientEvent, shouldSend?: () => boolean): Promise<void> {
    this.assertOpen();
    if (shouldSend?.() === false) return Promise.resolve();
    switch (event.type) {
      case 'session-update':
        return this.updateSession(event.config, shouldSend);
      case 'input-audio-mute':
        return this.stopCapture();
      case 'input-audio-unmute':
        return this.startCapture();
      case 'conversation-item-create':
        if (event.item.type === 'function-call-output') {
          const pending = this.pendingTools.get(event.item.callId);
          if (pending == null)
            throw new Error('Mistral function call is no longer pending.');
          this.pendingTools.delete(event.item.callId);
          clearTimeout(pending.timer);
          pending.resolve(event.item.output);
          return Promise.resolve();
        }
        break;
      case 'session-close':
        return this.close();
    }
    throw new UnsupportedFunctionalityError({
      functionality: `${event.type} in Mistral voice sessions`,
    });
  }

  private async updateSession(
    config: Parameters<typeof buildMistralRealtimeSessionConfig>[0],
    shouldSend?: () => boolean,
  ): Promise<void> {
    const payload = await buildMistralRealtimeSessionConfig(config, {
      update: true,
    });
    this.assertOpen();
    if (shouldSend?.() === false) return;
    const agent = this.findAgent();
    if (agent == null) throw new Error('Mistral voice agent is not connected.');
    const response = await this.room!.localParticipant.performRpc({
      destinationIdentity: agent.identity,
      method: 'mistral.session_update',
      payload: JSON.stringify(payload),
      responseTimeout: 5000,
    });
    const parsed = await safeParseJSON({ text: response });
    if (!parsed.success) throw parsed.error;
    // The server also broadcasts session.updated. Its reply is an acknowledgement,
    // not another event, so delivering both would duplicate the update.
  }

  private async handleToolCall(data: RpcInvocationData): Promise<string> {
    this.assertOpen();
    if (data.callerIdentity !== this.findAgent()?.identity)
      throw new Error('Only the Mistral voice agent may call tools.');
    const parsed = await safeParseJSON({
      text: data.payload,
      schema: functionCallSchema,
    });
    if (!parsed.success) throw parsed.error;
    this.assertOpen();
    const call = parsed.value;
    if (this.pendingTools.has(data.requestId) || this.pendingTools.size >= 64)
      throw new Error('Mistral voice has too many pending function calls.');
    const result = new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingTools.delete(data.requestId);
        reject(new Error(`Mistral function ${call.name} timed out.`));
      }, data.responseTimeout);
      this.pendingTools.set(data.requestId, { resolve, reject, timer });
    });
    // Attach a rejection handler before invoking application callbacks.
    void result.catch(() => {});
    await this.emit({
      type: 'function-call-arguments-delta',
      responseId: data.requestId,
      itemId: data.requestId,
      callId: data.requestId,
      delta: '',
      raw: call,
    });
    await this.emit({
      type: 'function-call-arguments-done',
      responseId: data.requestId,
      itemId: data.requestId,
      callId: data.requestId,
      name: call.name,
      arguments: JSON.stringify(call.arguments ?? {}),
      raw: call,
    });
    return result;
  }

  async startCapture(stream?: MediaStream): Promise<void> {
    this.assertOpen();
    const version = ++this.captureVersion;
    this.sourceStream = stream ?? this.sourceStream;
    const source = this.sourceStream;
    let owned: LocalAudioTrack | undefined;
    if (source == null) {
      const { createLocalAudioTrack } = await import('livekit-client');
      if (this.closed || version !== this.captureVersion) return;
      owned = await createLocalAudioTrack({
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      });
      this.ownedTracks.add(owned);
    }
    const track =
      owned?.mediaStreamTrack ??
      source?.getAudioTracks().find(track => track.readyState === 'live');
    if (this.closed || version !== this.captureVersion) {
      this.stopOwnedTrack(owned);
      return;
    }
    if (track == null) {
      this.stopOwnedTrack(owned);
      throw new Error('Mistral voice requires a live audio track.');
    }
    const room = this.room;
    if (room == null) {
      this.stopOwnedTrack(owned);
      throw new Error('Mistral voice is not connected.');
    }
    const operation = this.captureOperations.then(async () => {
      try {
        await this.releaseMicrophone();
        const { Track } = await import('livekit-client');
        if (this.closed || version !== this.captureVersion) {
          this.stopOwnedTrack(owned);
          return;
        }
        await room.localParticipant.publishTrack(track, {
          source: Track.Source.Microphone,
        });
        if (this.closed || version !== this.captureVersion) {
          await room.localParticipant.unpublishTrack(track, false);
          this.stopOwnedTrack(owned);
          return;
        }
        const onEnded = () => {
          if (this.microphone?.track === track) this.options.onCapturing(false);
        };
        track.addEventListener('ended', onEnded);
        this.microphone = {
          track,
          owned,
          removeListener: () => track.removeEventListener('ended', onEnded),
        };
        this.options.onCapturing(track.enabled && !track.muted);
      } catch (error) {
        this.stopOwnedTrack(owned);
        throw error;
      }
    });
    this.captureOperations = operation.catch(() => {});
    return operation;
  }

  stopCapture(): Promise<void> {
    ++this.captureVersion;
    const operation = this.captureOperations.then(() =>
      this.releaseMicrophone(),
    );
    this.captureOperations = operation.catch(() => {});
    return operation;
  }

  private async releaseMicrophone(): Promise<void> {
    const microphone = this.microphone;
    this.microphone = undefined;
    if (microphone != null) {
      microphone.removeListener();
      try {
        await this.room?.localParticipant.unpublishTrack(
          microphone.track,
          false,
        );
      } finally {
        this.stopOwnedTrack(microphone.owned);
        this.options.onCapturing(false);
      }
    } else this.options.onCapturing(false);
  }

  private stopOwnedTrack(track?: LocalAudioTrack): void {
    if (track != null && this.ownedTracks.delete(track)) track.stop();
  }

  stopPlayback(): void {
    this.playbackEnabled = false;
    for (const element of this.remoteAudio.values()) element.pause();
    this.options.onPlaying(false);
  }

  async resumePlayback(): Promise<void> {
    this.assertOpen();
    this.playbackEnabled = true;
    await this.room?.startAudio();
    await Promise.all(
      [...this.remoteAudio.values()].map(element => element.play()),
    );
    if (!this.closed) this.options.onPlaying(this.agentSpeaking);
  }

  private receive(payload: Uint8Array): void {
    if (!this.accepting || this.closed) return;
    if (
      this.pendingCount >= 512 ||
      this.pendingBytes + payload.byteLength > 8 * 1024 * 1024
    ) {
      this.fail(new Error('Mistral voice event queue exceeded its limit.'));
      return;
    }
    ++this.pendingCount;
    this.pendingBytes += payload.byteLength;
    this.incoming = this.incoming
      .then(async () => {
        if (this.closed) return;
        const parsed = await safeParseJSON({
          text: new TextDecoder().decode(payload),
        });
        if (!parsed.success) throw parsed.error;
        const raw = parsed.value;
        const transcript = transcriptSchema.safeParse(raw);
        if (transcript.success && transcript.data.final) {
          if (this.finalizedSegments.has(transcript.data.id)) return;
          this.finalizedSegments.add(transcript.data.id);
          if (this.finalizedSegments.size > 500)
            this.finalizedSegments.delete(
              this.finalizedSegments.values().next().value!,
            );
        }
        const state = z
          .object({
            type: z.literal('agent.state.changed'),
            state: z.string(),
          })
          .safeParse(raw);
        if (state.success) {
          this.agentSpeaking = state.data.state === 'speaking';
          this.options.onPlaying(this.playbackEnabled && this.agentSpeaking);
        }
        for (const event of parseMistralRealtimeEvent(raw))
          await this.emit(event);
        const error = errorSchema.safeParse(raw);
        if (error.success && error.data.fatal)
          this.fail(new Error(error.data.message));
      })
      .catch(error => this.fail(asError(error)))
      .finally(() => {
        --this.pendingCount;
        this.pendingBytes -= payload.byteLength;
      });
  }

  private async emit(event: ServerEvent): Promise<void> {
    if (this.closed) return;
    if (!this.ready) {
      if (this.pendingEvents.length >= 512)
        throw new Error('Mistral voice startup event queue is full.');
      this.pendingEvents.push(event);
      return;
    }
    const delivery = this.deliveries.then(async () => {
      if (this.closed) return;
      try {
        await this.options.onEvent(event);
      } catch (error) {
        this.options.onError(asError(error));
      }
    });
    this.deliveries = delivery.catch(() => {});
    return delivery;
  }

  private findAgent(): RemoteParticipant | undefined {
    return [...(this.room?.remoteParticipants.values() ?? [])].find(
      participant => participant.isAgent,
    );
  }

  private checkAgentDisconnect(): void {
    if (!this.agentDisconnected || this.agentCheckQueued) return;
    this.agentCheckQueued = true;
    queueMicrotask(() => {
      this.agentCheckQueued = false;
      if (this.closed || this.reconnecting) return;
      if (this.findAgent() != null) this.agentDisconnected = false;
      else this.fail(new Error('Mistral voice agent disconnected.'));
    });
  }

  private assertOpen(): void {
    if (this.closed || this.abort.signal.aborted)
      throw new Error('Mistral voice connection is closed.');
  }

  private untilAborted<T>(operation: Promise<T>): Promise<T> {
    if (this.abort.signal.aborted)
      return Promise.reject(new Error('Mistral voice connection cancelled.'));
    return new Promise<T>((resolve, reject) => {
      const onAbort = () =>
        reject(new Error('Mistral voice connection cancelled.'));
      this.abort.signal.addEventListener('abort', onAbort, { once: true });
      operation.then(resolve, reject).finally(() => {
        this.abort.signal.removeEventListener('abort', onAbort);
      });
    });
  }

  private fail(error: Error): void {
    if (this.closed || this.failed) return;
    this.failed = true;
    this.accepting = false;
    this.options.onFatalError(error);
    this.dispose();
  }

  async finish(): Promise<void> {
    this.accepting = false;
    await this.incoming;
    await this.deliveries;
  }

  private removeRemoteTrack(track: RemoteTrack): void {
    const element = this.remoteAudio.get(track);
    if (element == null) return;
    this.remoteAudio.delete(track);
    element.pause();
    element.srcObject = null;
    track.detach(element);
    element.remove();
  }

  close(): Promise<void> {
    if (this.cleanup != null) return this.cleanup;
    let disconnected: Promise<void> | undefined;
    // Cache cleanup before callbacks: consumers may dispose again while a media
    // state notification is being delivered.
    this.cleanup = Promise.resolve().then(async () => {
      try {
        await disconnected;
      } finally {
        await this.setup?.catch(() => {});
        if (this.session != null && this.api != null) {
          const separator = this.api.includes('?') ? '&' : '?';
          const response = await fetch(
            `${this.api}${separator}sessionId=${encodeURIComponent(this.session.id)}`,
            { method: 'DELETE', keepalive: true },
          );
          if (!response.ok)
            throw new Error(
              `Failed to close Mistral voice session: ${response.status}`,
            );
        }
      }
    });
    this.closed = true;
    this.accepting = false;
    ++this.captureVersion;
    this.abort.abort();
    this.removeAbortListener?.();
    this.removeRoomListeners?.();
    this.pendingEvents = [];
    for (const pending of this.pendingTools.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Mistral voice session closed.'));
    }
    this.pendingTools.clear();
    for (const track of this.remoteAudio.keys()) this.removeRemoteTrack(track);
    for (const track of this.ownedTracks) this.stopOwnedTrack(track);
    this.microphone?.removeListener();
    this.microphone = undefined;
    this.options.onCapturing(false);
    this.options.onPlaying(false);
    // false is essential: LiveKit must not stop caller-owned microphone tracks.
    disconnected = this.room?.disconnect(false);
    return this.cleanup;
  }

  dispose(): void {
    void this.close().catch(error => this.options.onError(asError(error)));
  }
}
