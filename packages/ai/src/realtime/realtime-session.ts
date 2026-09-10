import { UnsupportedFunctionalityError } from '@ai-sdk/provider';
import { generateId, safeParseJSON } from '@ai-sdk/provider-utils';
import type {
  RealtimeClientEvent,
  RealtimeModel,
  RealtimeServerEvent,
  RealtimeSessionConfig,
} from '../types/realtime-model';
import { BrowserRealtimeAudio } from './browser-realtime-audio';
import { BrowserRealtimeTransport } from './browser-realtime-transport';
import { BrowserRealtimeWebRTC } from './browser-realtime-webrtc';
import { BrowserRealtimeLiveWebSocket } from './browser-realtime-live-websocket';
import {
  createInitialRealtimeState,
  RealtimeEventReducer,
  type RealtimeReducerEffect,
  type RealtimeState,
  type RealtimeStatus,
} from './realtime-event-reducer';

export type {
  RealtimeLiveState,
  RealtimeState,
  RealtimeStatus,
} from './realtime-event-reducer';

export type RealtimeSessionOptions = {
  model: RealtimeModel;
  /** websocket connects to an application-owned raw-protocol relay.
   * session exchanges { sdp, sessionConfig } for { sessionId, sdp } over HTTP.
   */
  api:
    | { token: string; session?: never; websocket?: never; protocols?: never }
    | { session: string; token?: never; websocket?: never; protocols?: never }
    | {
        websocket: string;
        protocols?: string[];
        token?: never;
        session?: never;
      };
  sessionConfig?: Partial<RealtimeSessionConfig>;
  sampleRate?: number;
  maxEvents?: number;
  /** Maximum time to establish transport and receive session-started. Default: 30s. */
  startupTimeoutMs?: number;
  /** Maximum wait for final usage after close(). Default: 15s. */
  closeTimeoutMs?: number;
  onToolCall?: (args: {
    toolCall: { toolCallId: string; toolName: string; args: unknown };
  }) => Promise<unknown> | unknown | undefined;
  onEvent?: (event: RealtimeServerEvent) => void;
  onError?: (error: Error) => void;
};

export abstract class AbstractRealtimeSession {
  protected state: RealtimeState = createInitialRealtimeState();
  protected maxEvents: number;

  onToolCall: RealtimeSessionOptions['onToolCall'];
  onEvent: ((event: RealtimeServerEvent) => void) | undefined;
  onError: ((error: Error) => void) | undefined;

  private readonly model: RealtimeModel;
  private readonly api: RealtimeSessionOptions['api'];
  private readonly sessionConfig: Partial<RealtimeSessionConfig> | undefined;
  private readonly reducer: RealtimeEventReducer;
  private readonly transport: BrowserRealtimeTransport;
  private readonly audio: BrowserRealtimeAudio;
  private readonly rtc: BrowserRealtimeWebRTC;
  private readonly liveWebSocket: BrowserRealtimeLiveWebSocket;
  private readonly continuous: boolean;
  private readonly startupTimeoutMs: number;
  private readonly closeTimeoutMs: number;
  private generation = 0;
  private setupAbort?: AbortController;
  private startupTimer?: ReturnType<typeof setTimeout>;
  private closeTimer?: ReturnType<typeof setTimeout>;
  private closePromise?: Promise<void>;
  private resolveClose?: () => void;
  private readonly muteCommands = new Map<string, boolean>();
  private readonly commandIds = new Set<string>();
  private readonly toolResultCommands = new Map<
    string,
    { callId: string; responseId: string; rejected: boolean }
  >();
  private readonly backendResponses = new Map<
    string,
    {
      calls: Set<string>;
      outputs: Set<string>;
      pendingOutputs: Map<string, Promise<void>>;
      outputCommandIds: Map<string, string>;
      continuationVersion: number;
      done: boolean;
      continued: boolean;
      status?: string;
    }
  >();
  private readonly backendCalls = new Map<string, string>();
  private currentResponseItemId: string | null = null;

  // Tool calls requested by the current (tool-bearing) response, the outputs
  // that have been submitted for them, and whether that response has finished
  // delivering its tool calls. Used to request a single response only once
  // every tool output for the turn has been submitted.
  private readonly toolCallsInResponse = new Set<string>();
  private readonly submittedToolOutputs = new Set<string>();
  private responseToolCallsClosed = false;

  protected abstract setState<K extends keyof RealtimeState>(
    key: K,
    value: RealtimeState[K],
  ): void;

  constructor(options: RealtimeSessionOptions) {
    this.continuous = options.model.capabilities?.conversation === 'continuous';
    this.model = options.model;
    this.api = options.api;
    this.sessionConfig = options.sessionConfig;
    this.maxEvents = options.maxEvents ?? 500;
    this.startupTimeoutMs = options.startupTimeoutMs ?? 30_000;
    this.closeTimeoutMs = options.closeTimeoutMs ?? 15_000;
    if (!Number.isSafeInteger(this.maxEvents) || this.maxEvents < 1)
      throw new Error('maxEvents must be a positive integer');
    for (const timeout of [this.startupTimeoutMs, this.closeTimeoutMs]) {
      if (!Number.isFinite(timeout) || timeout <= 0 || timeout > 2_147_483_647)
        throw new Error(
          'Realtime timeouts must be positive finite timer durations',
        );
    }
    this.reducer = new RealtimeEventReducer(this.maxEvents);
    this.onToolCall = options.onToolCall;
    this.onEvent = options.onEvent;
    this.onError = options.onError;

    const sampleRate = options.sampleRate ?? 24000;
    const captureSampleRate =
      options.sessionConfig?.inputAudioFormat?.rate ?? sampleRate;
    const playbackSampleRate =
      options.sessionConfig?.outputAudioFormat?.rate ?? sampleRate;

    this.transport = new BrowserRealtimeTransport({
      model: this.model,
      onServerEvent: event => this.handleServerEvent(event),
      onError: error => {
        this.applyState(this.reducer.setStatus(this.state, 'error'));
        this.reportError(error);
      },
      onClose: () => {
        this.disconnect();
      },
    });

    this.rtc = new BrowserRealtimeWebRTC({
      model: this.model,
      onEvent: event => this.handleServerEvent(event),
      onError: error => this.reportError(error),
      onClose: () => this.disconnect(),
      onCapturing: isCapturing =>
        this.applyState({ ...this.state, isCapturing }),
      onPlaying: isPlaying => this.applyState({ ...this.state, isPlaying }),
    });

    this.liveWebSocket = new BrowserRealtimeLiveWebSocket({
      model: this.model,
      sessionConfig: this.sessionConfig,
      sampleRate: options.sampleRate,
      onEvent: event => this.handleServerEvent(event),
      onError: error => {
        void this.reportError(error);
      },
      onFatalError: error => {
        this.disconnect();
        this.applyState({ ...this.state, status: 'error' });
        void this.reportError(error);
      },
      onClose: () => this.disconnect(),
      onCapturing: isCapturing =>
        this.applyState({ ...this.state, isCapturing }),
      onPlaying: isPlaying => this.applyState({ ...this.state, isPlaying }),
    });

    this.audio = new BrowserRealtimeAudio({
      captureSampleRate,
      playbackSampleRate,
      onAudio: audio => this.sendAudio(audio),
      onCapturingChange: isCapturing => {
        this.applyState(this.reducer.setCapturing(this.state, isCapturing));
      },
      onPlayingChange: isPlaying => {
        this.applyState(this.reducer.setPlaying(this.state, isPlaying));
      },
    });
  }

  // ── Connection ─────────────────────────────────────────────────────

  /** Live requests a microphone by default. Supplied streams remain caller-owned. */
  connect(): Promise<void>;
  connect(options: { stream?: MediaStream }): Promise<void>;
  async connect(options?: { stream?: MediaStream }): Promise<void> {
    if (
      this.state.status === 'connecting' ||
      this.state.status === 'connected' ||
      this.state.status === 'closing'
    ) {
      throw new Error('Realtime session is already active');
    }
    this.setupAbort?.abort();
    this.transport.disconnect();
    const generation = ++this.generation;
    this.closePromise = undefined;
    this.backendResponses.clear();
    this.backendCalls.clear();
    this.muteCommands.clear();
    this.commandIds.clear();
    this.toolResultCommands.clear();
    this.toolCallsInResponse.clear();
    this.submittedToolOutputs.clear();
    this.responseToolCallsClosed = false;
    this.applyState(this.reducer.setStatus(this.state, 'connecting'));

    try {
      if (this.continuous) {
        if (this.api.session == null && this.api.websocket == null)
          throw new Error(
            'Continuous realtime models require api.websocket or api.session',
          );
        this.applyState({
          ...this.state,
          live: {
            transcripts: [],
            delegations: [],
            isInputMuted: false,
            finalization: 'pending',
          },
        });
        this.startupTimer = setTimeout(() => {
          if (
            generation !== this.generation ||
            this.state.status !== 'connecting'
          )
            return;
          this.disconnect();
          this.applyState({ ...this.state, status: 'error' });
          this.reportError(new Error('Realtime session startup timed out'));
        }, this.startupTimeoutMs);
        if (this.api.websocket != null) {
          this.liveWebSocket.connect({
            url: this.api.websocket,
            protocols: this.api.protocols,
            stream: options?.stream,
          });
        } else if (this.api.session != null)
          await this.rtc.connect({
            api: this.api.session,
            sessionConfig: this.sessionConfig,
            stream: options?.stream,
            timeoutMs: this.startupTimeoutMs,
          });
        return;
      }
      if (this.api.token == null)
        throw new Error('Turn-based realtime models require api.token');
      this.setupAbort = new AbortController();
      const response = await fetch(this.api.token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionConfig: this.sessionConfig }),
        signal: this.setupAbort.signal,
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch realtime setup: ${response.status}`);
      }

      const setupData = await response.json();
      if (generation !== this.generation) return;
      const { token, url, tools: toolDefinitions } = setupData;

      const config: RealtimeSessionConfig = {
        ...this.sessionConfig,
        tools: toolDefinitions as RealtimeSessionConfig['tools'],
      };

      this.audio.ensurePlaybackContext();
      this.transport.connect({
        token,
        url,
        onOpen: () => {
          this.sendEvent({
            type: 'session-update',
            config,
          });
        },
      });
    } catch (error) {
      if (generation !== this.generation) return;
      if (this.continuous) this.disconnect();
      this.applyState(this.reducer.setStatus(this.state, 'error'));
      this.reportError(
        error instanceof Error
          ? error
          : new Error(`Connection failed: ${String(error)}`),
      );
    }
  }

  /** Force disposal. A Live session retains its last usage as unconfirmed. */
  disconnect(): void {
    this.generation++;
    this.commandIds.clear();
    this.toolResultCommands.clear();
    this.setupAbort?.abort();
    this.setupAbort = undefined;
    clearTimeout(this.startupTimer);
    clearTimeout(this.closeTimer);
    if (this.continuous) {
      this.liveTransport.dispose();
      const live = this.state.live;
      if (live != null && live.finalization !== 'confirmed') {
        this.applyState({
          ...this.state,
          live: { ...live, finalization: 'unconfirmed' },
        });
      }
    }
    this.transport.disconnect();
    this.applyState(this.reducer.setStatus(this.state, 'disconnected'));
    this.resolveClose?.();
    this.resolveClose = undefined;
  }

  /** Wait for the provider's final usage acknowledgement, then release media. */
  close(options?: { eventId?: string }): Promise<void> {
    if (!this.continuous) {
      this.disconnect();
      return Promise.resolve();
    }
    if (this.closePromise != null) return this.closePromise;
    if (this.state.status !== 'connected') {
      this.disconnect();
      return Promise.resolve();
    }
    if (options?.eventId != null) this.reserveCommandId(options.eventId);
    this.closePromise = new Promise(resolve => {
      this.resolveClose = resolve;
    });
    this.applyState({ ...this.state, status: 'closing' });
    if (this.api.websocket != null) this.liveWebSocket.stopCapture();
    this.closeTimer = setTimeout(() => this.disconnect(), this.closeTimeoutMs);
    try {
      // Transport shutdown drains received terminal events before finalizing loss.
      this.liveTransport.sendEvent({
        type: 'session-close',
        eventId: options?.eventId,
      });
    } catch (error) {
      this.disconnect();
      this.reportError(error);
    }
    return this.closePromise;
  }

  // ── Sending events ─────────────────────────────────────────────────

  /** Managed backend-tool-result commands deduplicate and automatically continue
   * completed tool responses, just like addToolOutput(). */
  sendEvent(event: RealtimeClientEvent): Promise<void> {
    if (this.continuous) {
      if (this.state.status !== 'connected')
        throw new Error('Realtime session is not accepting submissions');
      if (
        (event.type === 'input-audio-append' && this.api.session != null) ||
        event.type === 'input-audio-commit' ||
        event.type === 'input-audio-clear'
      ) {
        throw new UnsupportedFunctionalityError({
          functionality:
            'JSON audio commands over WebRTC; audio is carried by the media track',
        });
      }
      if (event.type === 'session-close') {
        return this.close({ eventId: event.eventId });
      }
      if (event.type === 'session-start')
        throw new Error('Realtime session has already started');
      if (
        event.type === 'backend-input-create' ||
        event.type === 'backend-response-create' ||
        event.type === 'backend-tool-result'
      ) {
        if (this.state.live?.delegationMode !== 'responses')
          throw new Error(
            'Backend commands require a session confirmed in responses delegation mode',
          );
        if (
          event.type === 'backend-response-create' &&
          this.hasPendingBackendTools()
        )
          throw new Error(
            'Submit pending realtime tool results before requesting a backend response',
          );
      }
      if (
        event.type === 'input-audio-mute' ||
        event.type === 'input-audio-unmute'
      ) {
        if (this.muteCommands.size >= 512)
          throw new Error('Too many pending realtime commands');
        const eventId = event.eventId ?? generateId();
        this.reserveCommandId(eventId);
        const generation = this.generation;
        const sent = this.liveTransport.sendEvent({ ...event, eventId });
        this.muteCommands.set(eventId, event.type === 'input-audio-mute');
        void sent.catch(() => {
          if (generation === this.generation) this.muteCommands.delete(eventId);
        });
        return sent;
      }
      if (event.type === 'backend-tool-result')
        return this.sendBackendToolResult(event);
      if ('eventId' in event && event.eventId != null)
        this.reserveCommandId(event.eventId);
      return this.liveTransport.sendEvent(event);
    }
    return this.transport.sendEvent(event);
  }

  /** Continuous models submit text to the backend, separately from spoken transcripts. */
  sendTextMessage(text: string): void {
    if (this.continuous) {
      if (this.hasPendingBackendTools())
        throw new Error(
          'Submit pending realtime tool results before sending a backend message',
        );
      const generation = this.generation;
      const sent = this.sendEvent({
        type: 'backend-input-create',
        content: [{ type: 'text', text }],
      });
      void sent
        .then(() => {
          if (
            generation === this.generation &&
            this.state.status === 'connected'
          )
            return this.sendEvent({ type: 'backend-response-create' });
        })
        .catch(error => {
          if (generation === this.generation) void this.reportError(error);
        });
      return;
    }
    this.sendEvent({
      type: 'conversation-item-create',
      item: { type: 'text-message', role: 'user', text },
    });
    this.sendEvent({ type: 'response-create' });
    this.applyState(this.reducer.addUserTextMessage(this.state, text));
  }

  sendAudio(base64Audio: string): void {
    this.sendEvent({ type: 'input-audio-append', audio: base64Audio });
  }

  commitAudio(): void {
    this.sendEvent({ type: 'input-audio-commit' });
  }

  clearAudioBuffer(): void {
    this.sendEvent({ type: 'input-audio-clear' });
  }

  requestResponse(options?: { modalities?: string[] }): void {
    this.sendEvent({
      type: 'response-create',
      ...(options != null ? { options } : {}),
    });
  }

  cancelResponse(): void {
    this.sendEvent({ type: 'response-cancel' });
  }

  // ── Tool output ───────────────────────────────────────────────────

  addToolOutput(callId: string, result: unknown): void {
    if (this.continuous) {
      this.sendEvent({
        type: 'backend-tool-result',
        callId,
        output:
          typeof result === 'string'
            ? result
            : (JSON.stringify(result) ?? 'null'),
      });
      return;
    }
    const { state, output } = this.reducer.addToolOutput(
      this.state,
      callId,
      result,
    );
    this.applyState(state);

    this.sendEvent({
      type: 'conversation-item-create',
      item: {
        type: 'function-call-output',
        callId: output.callId,
        name: output.name,
        output: output.output,
      },
    });

    this.submittedToolOutputs.add(callId);
    this.maybeRequestToolResponse();
  }

  /**
   * Requests a single response once the tool-bearing response has finished
   * delivering its tool calls and every one of them has an output. Requesting a
   * response after each individual output can cause the model to continue
   * without the full tool context on multi-tool turns.
   */
  private maybeRequestToolResponse(): void {
    if (!this.responseToolCallsClosed) return;
    if (this.toolCallsInResponse.size === 0) return;

    for (const callId of this.toolCallsInResponse) {
      if (!this.submittedToolOutputs.has(callId)) return;
    }

    this.sendEvent({ type: 'response-create' });
    this.toolCallsInResponse.clear();
    this.submittedToolOutputs.clear();
    this.responseToolCallsClosed = false;
  }

  // ── Audio capture ──────────────────────────────────────────────────

  startAudioCapture(stream: MediaStream): void {
    if (this.continuous)
      throw new UnsupportedFunctionalityError({
        functionality:
          'Replacing Live capture; supply a stream to connect() instead',
      });
    this.audio.startCapture(stream);
  }

  stopAudioCapture(): void {
    if (this.continuous && this.api.websocket != null) {
      this.liveWebSocket.stopCapture();
      return;
    }
    if (this.continuous)
      throw new UnsupportedFunctionalityError({
        functionality:
          'Stopping WebRTC capture; send input-audio-mute or disconnect instead',
      });
    this.audio.stopCapture();
  }

  // ── Playback ───────────────────────────────────────────────────────

  stopPlayback(): void {
    if (this.continuous) {
      this.liveTransport.stopPlayback();
      return;
    }
    this.audio.stopPlayback();
  }

  async resumePlayback(): Promise<void> {
    if (this.continuous) {
      await this.liveTransport.resumePlayback();
      return;
    }
    await this.audio.resumePlayback();
  }

  // ── Cleanup ────────────────────────────────────────────────────────

  dispose(): void {
    this.disconnect();
    this.audio.dispose();
    this.applyState(
      this.reducer.setStatus(
        this.reducer.setPlaying(
          this.reducer.setCapturing(this.state, false),
          false,
        ),
        'disconnected',
      ),
    );
  }

  // ── Private helpers ────────────────────────────────────────────────

  private get liveTransport() {
    return this.api.session != null ? this.rtc : this.liveWebSocket;
  }

  private hasPendingBackendTools(): boolean {
    return [...this.backendResponses.values()].some(group =>
      [...group.calls].some(id => !group.outputs.has(id)),
    );
  }

  private reserveCommandId(eventId: string): void {
    if (this.commandIds.has(eventId))
      throw new Error(
        'Realtime command ID was already used; retry with a fresh eventId',
      );
    if (this.commandIds.size >= 4096)
      throw new Error(
        'Realtime command tracking is full; reconnect before submitting more identified commands',
      );
    this.commandIds.add(eventId);
  }

  private rejectToolResult(eventId: string): void {
    const command = this.toolResultCommands.get(eventId);
    if (command == null || command.rejected) return;
    command.rejected = true;
    const group = this.backendResponses.get(command.responseId);
    if (group?.outputCommandIds.get(command.callId) !== eventId) return;
    group.outputs.delete(command.callId);
    group.pendingOutputs.delete(command.callId);
    group.continued = false;
    group.continuationVersion++;
  }

  /** Managed results share deduplication and automatic continuation on both public APIs. */
  private sendBackendToolResult(
    event: Extract<RealtimeClientEvent, { type: 'backend-tool-result' }>,
  ): Promise<void> {
    const responseId = this.backendCalls.get(event.callId);
    const group =
      responseId == null ? undefined : this.backendResponses.get(responseId);
    if (group == null || responseId == null)
      throw new Error(`Unknown realtime tool call: ${event.callId}`);
    if (group.outputs.has(event.callId)) return Promise.resolve();
    const pending = group.pendingOutputs.get(event.callId);
    if (pending != null) return pending;
    const generation = this.generation;
    const eventId = event.eventId ?? generateId();
    this.reserveCommandId(eventId);
    const command = { callId: event.callId, responseId, rejected: false };
    this.toolResultCommands.set(eventId, command);
    group.outputCommandIds.set(event.callId, eventId);
    let sent: Promise<void>;
    try {
      sent = this.liveTransport.sendEvent({ ...event, eventId });
    } catch (error) {
      command.rejected = true;
      throw error;
    }
    const submitted = sent.then(
      () => {
        if (
          generation !== this.generation ||
          command.rejected ||
          group.outputCommandIds.get(event.callId) !== eventId
        )
          return;
        group.pendingOutputs.delete(event.callId);
        group.outputs.add(event.callId);
        this.maybeContinueBackend(group);
      },
      error => {
        command.rejected = true;
        if (group.outputCommandIds.get(event.callId) === eventId)
          group.pendingOutputs.delete(event.callId);
        throw error;
      },
    );
    group.pendingOutputs.set(event.callId, submitted);
    // The transport reports send failures; ignored public promises must not leak rejections.
    void submitted.catch(() => {});
    return submitted;
  }

  private applyState(nextState: RealtimeState): void {
    const previousState = this.state;
    this.state = nextState;

    if (previousState.status !== nextState.status) {
      this.setState('status', nextState.status);
    }
    if (previousState.messages !== nextState.messages) {
      this.setState('messages', nextState.messages);
    }
    if (previousState.events !== nextState.events) {
      this.setState('events', nextState.events);
    }
    if (previousState.isCapturing !== nextState.isCapturing) {
      this.setState('isCapturing', nextState.isCapturing);
    }
    if (previousState.isPlaying !== nextState.isPlaying) {
      this.setState('isPlaying', nextState.isPlaying);
    }
    if (previousState.live !== nextState.live)
      this.setState('live', nextState.live);
  }

  private async executeToolCall({
    name,
    args,
    callId,
  }: {
    name: string;
    args: Record<string, unknown>;
    callId: string;
  }): Promise<void> {
    const generation = this.generation;
    if (this.onToolCall == null) {
      this.reportError(new Error(`No handler provided for tool "${name}"`));
      return;
    }

    try {
      const result = await this.onToolCall({
        toolCall: { toolCallId: callId, toolName: name, args },
      });

      // Returning `undefined` is the documented human-in-the-loop pattern:
      // the application submits the output later via `addToolOutput`. Only an
      // explicitly returned value is submitted automatically here.
      if (result !== undefined && generation === this.generation) {
        this.addToolOutput(callId, result);
      }
    } catch (error) {
      if (generation !== this.generation) return;
      this.reportError(
        error instanceof Error
          ? error
          : new Error(`Client tool execution failed: ${String(error)}`),
      );
    }
  }

  private async handleServerEvent(event: RealtimeServerEvent): Promise<void> {
    if (this.continuous) {
      await this.handleLiveEvent(event);
      return;
    }
    const generation = this.generation;
    const result = await this.reducer.reduceServerEvent(this.state, event);
    if (generation !== this.generation) return;
    this.applyState(result.state);
    this.notifyEvent(event);

    for (const effect of result.effects) {
      this.handleReducerEffect(effect);
    }

    // `response-done` for a response that requested tool calls marks the point
    // where no further tool calls will arrive for that turn, so we can request
    // the follow-up response once every output is in.
    if (event.type === 'response-done' && this.toolCallsInResponse.size > 0) {
      this.responseToolCallsClosed = true;
      this.maybeRequestToolResponse();
    }
  }

  private handleReducerEffect(effect: RealtimeReducerEffect): void {
    switch (effect.type) {
      case 'play-audio': {
        this.currentResponseItemId = effect.itemId;
        this.audio.playAudio(effect.delta);
        break;
      }
      case 'speech-started': {
        if (this.state.isPlaying) {
          const playedMs = this.audio.getPlaybackOffsetMs();
          this.audio.stopPlayback();

          if (this.currentResponseItemId != null) {
            this.sendEvent({
              type: 'conversation-item-truncate',
              itemId: this.currentResponseItemId,
              contentIndex: 0,
              audioEndMs: Math.round(playedMs),
            });
          }
        }
        break;
      }
      case 'tool-call': {
        // Track every tool call in the response so a multi-tool turn only
        // triggers a single `response-create` once all outputs are submitted.
        this.toolCallsInResponse.add(effect.callId);
        void this.executeToolCall({
          name: effect.name,
          args: effect.args,
          callId: effect.callId,
        });
        break;
      }
      case 'error': {
        this.reportError(effect.error);
        break;
      }
    }
  }

  private async reportError(error: unknown): Promise<void> {
    try {
      await this.onError?.(
        error instanceof Error ? error : new Error(String(error)),
      );
    } catch {
      /* Application errors must not interrupt connection cleanup. */
    }
  }

  private notifyEvent(event: RealtimeServerEvent): void {
    const generation = this.generation;
    try {
      void Promise.resolve(this.onEvent?.(event)).catch(error => {
        if (generation === this.generation) this.reportError(error);
      });
    } catch (error) {
      this.reportError(error);
    }
  }

  private maybeContinueBackend(group: {
    calls: Set<string>;
    outputs: Set<string>;
    done: boolean;
    continued: boolean;
    continuationVersion: number;
    status?: string;
  }): void {
    if (
      this.state.status !== 'connected' ||
      this.state.live?.delegationMode !== 'responses' ||
      !group.done ||
      group.continued ||
      group.calls.size === 0 ||
      group.status !== 'completed'
    )
      return;
    if ([...group.calls].some(id => !group.outputs.has(id))) return;
    group.continued = true;
    const generation = this.generation;
    const version = group.continuationVersion;
    try {
      // A rejected result cancels queued continuation, but cannot retract an on-wire response.
      // Retry corrected output manually; never rerun the tool handler for the same call.
      const sent = this.liveTransport.sendEvent(
        {
          type: 'backend-response-create',
        },
        () =>
          generation === this.generation &&
          this.state.status === 'connected' &&
          version === group.continuationVersion,
      );
      void sent.catch(() => {
        if (
          generation === this.generation &&
          version === group.continuationVersion
        )
          group.continued = false;
      });
    } catch (error) {
      group.continued = false;
      void this.reportError(error);
    }
  }

  private getBackendResponse(responseId: string) {
    let group = this.backendResponses.get(responseId);
    if (group != null) return group;
    if (this.backendResponses.size >= 512 || this.backendCalls.size >= 4096) {
      for (const [id, candidate] of this.backendResponses) {
        if (
          candidate.done &&
          (candidate.calls.size === 0 ||
            candidate.continued ||
            candidate.status !== 'completed')
        ) {
          this.backendResponses.delete(id);
          for (const callId of candidate.calls)
            this.backendCalls.delete(callId);
          break;
        }
      }
      if (this.backendResponses.size >= 512 || this.backendCalls.size >= 4096)
        throw new Error('Too many pending realtime backend calls');
    }
    group = {
      calls: new Set<string>(),
      outputs: new Set<string>(),
      pendingOutputs: new Map<string, Promise<void>>(),
      outputCommandIds: new Map<string, string>(),
      continuationVersion: 0,
      done: false,
      continued: false,
    };
    this.backendResponses.set(responseId, group);
    return group;
  }

  private async handleLiveEvent(event: RealtimeServerEvent): Promise<void> {
    const generation = this.generation;
    let tool: { callId: string; name: string; args: unknown } | undefined;
    let live = this.state.live;
    if (live == null || live.finalization !== 'pending') return;
    this.applyState({
      ...this.state,
      events: [...this.state.events, event].slice(-this.maxEvents),
    });
    switch (event.type) {
      case 'session-started':
        live = {
          ...live,
          sessionId: event.sessionId,
          delegationMode: event.delegationMode,
        };
        clearTimeout(this.startupTimer);
        if (this.state.status === 'connecting')
          this.applyState({ ...this.state, status: 'connected' });
        break;
      case 'audio-chunk':
        if (this.api.websocket != null)
          this.liveWebSocket.playAudio(event.delta);
        break;
      case 'session-usage':
        live = { ...live, usage: event.usage };
        break;
      case 'session-closed':
        live = {
          ...live,
          sessionId: event.sessionId ?? live.sessionId,
          usage: event.usage,
          terminationReason: event.reason,
          finalization: 'confirmed',
        };
        break;
      case 'transcript-fragment':
        live = {
          ...live,
          transcripts: [...live.transcripts, event].slice(-this.maxEvents),
        };
        break;
      case 'delegation-created':
        if (
          !live.delegations.some(d => d.delegationId === event.delegationId)
        ) {
          live = {
            ...live,
            delegations: [...live.delegations, event].slice(-this.maxEvents),
          };
        }
        break;
      case 'command-acknowledged': {
        if (event.clientEventId != null) {
          const muted = this.muteCommands.get(event.clientEventId);
          if (muted != null) live = { ...live, isInputMuted: muted };
          this.muteCommands.delete(event.clientEventId);
        }
        break;
      }
      case 'backend-response-created':
        this.getBackendResponse(event.responseId);
        break;
      case 'backend-tool-call': {
        if (
          this.state.live?.delegationMode !== 'responses' ||
          this.state.status !== 'connected' ||
          this.backendCalls.has(event.callId)
        )
          break;
        const group = this.getBackendResponse(event.responseId);
        if (group.done) break;
        if (this.backendCalls.size >= 4096)
          throw new Error('Too many pending realtime backend calls');
        group.calls.add(event.callId);
        this.backendCalls.set(event.callId, event.responseId);
        const parsed = await safeParseJSON({ text: event.arguments });
        if (generation !== this.generation) return;
        if (!parsed.success) {
          this.reportError(
            new Error(`Invalid arguments for realtime tool ${event.name}`),
          );
          break;
        }
        tool = { callId: event.callId, name: event.name, args: parsed.value };
        break;
      }
      case 'backend-response-done': {
        const group = this.getBackendResponse(event.responseId);
        if (group.done) break;
        group.done = true;
        group.status = event.status;
        if (event.usage != null)
          live = {
            ...live,
            backendUsage: [...(live.backendUsage ?? []), event].slice(
              -this.maxEvents,
            ),
          };
        this.maybeContinueBackend(group);
        break;
      }
      case 'error':
        if (event.clientEventId != null) {
          this.muteCommands.delete(event.clientEventId);
          this.rejectToolResult(event.clientEventId);
        }
        this.reportError(new Error(event.message));
        break;
    }
    if (generation !== this.generation) return;
    this.applyState({ ...this.state, live });
    if (
      event.type === 'session-started' &&
      this.api.websocket != null &&
      this.state.status === 'connected'
    )
      this.liveWebSocket.startCapture();
    if (event.type === 'session-closed') this.disconnect();
    this.notifyEvent(event);
    if (
      tool != null &&
      generation === this.generation &&
      this.state.status === 'connected'
    ) {
      void this.executeLiveTool(tool.callId, tool.name, tool.args);
    }
  }

  private async executeLiveTool(
    callId: string,
    name: string,
    args: unknown,
  ): Promise<void> {
    const generation = this.generation;
    try {
      const result = await this.onToolCall?.({
        toolCall: { toolCallId: callId, toolName: name, args },
      });
      if (
        generation === this.generation &&
        this.state.status === 'connected' &&
        result !== undefined
      )
        this.addToolOutput(callId, result);
    } catch (error) {
      if (generation === this.generation) this.reportError(error);
    }
  }
}
