import { UnsupportedFunctionalityError } from '@ai-sdk/provider';
import type {
  RealtimeClientEvent,
  RealtimeModel,
  RealtimeServerEvent,
  RealtimeSessionConfig,
} from '../types/realtime-model';
import { BrowserRealtimeAudio } from './browser-realtime-audio';
import { BrowserRealtimeTransport } from './browser-realtime-transport';
import { BrowserRealtimeLiveWebSocket } from './browser-realtime-live-websocket';
import { RealtimeAttempt } from './realtime-attempt';
import { RealtimeCommandCoordinator } from './realtime-command-coordinator';
import {
  createSessionState,
  reduceSessionState,
} from './realtime-session-state';
import {
  createInitialRealtimeState,
  RealtimeEventReducer,
  type RealtimeReducerEffect,
  type RealtimeState,
} from './realtime-event-reducer';

export type { RealtimeSessionState } from './realtime-session-state';
export type { RealtimeState, RealtimeStatus } from './realtime-event-reducer';

export type RealtimeSessionOptions = {
  model: RealtimeModel;
  /** websocket uses a raw-protocol relay; token fetches client-secret setup. */
  api:
    | { token: string; session?: never; websocket?: never; protocols?: never }
    | {
        websocket: string;
        protocols?: string[];
        token?: never;
        session?: never;
      };
  sessionConfig?: Partial<RealtimeSessionConfig>;
  sampleRate?: number;
  maxEvents?: number;
  /** Backend tool continuation is opt-in. Frontend turns retain automatic continuation. */
  autoContinueTools?: boolean;
  /** Maximum time to establish transport and receive readiness. Default: 30s. */
  startupTimeoutMs?: number;
  /** Maximum wait for final usage after close(). Default: 15s. */
  closeTimeoutMs?: number;
  /** Local playback pauses at this budget until resumePlayback(). Default: 2s. */
  maxPlaybackBufferSeconds?: number;
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
  onEvent: RealtimeSessionOptions['onEvent'];
  onError: RealtimeSessionOptions['onError'];
  private readonly reducer: RealtimeEventReducer;
  private readonly sessionLifecycle: boolean;
  private readonly continuous: boolean;
  private attempt?: RealtimeAttempt;
  private commands?: RealtimeCommandCoordinator;
  private transport?: BrowserRealtimeTransport;
  private audio?: BrowserRealtimeAudio;
  private pcm?: BrowserRealtimeLiveWebSocket;
  private suppliedStream?: MediaStream;
  private captureGeneration = 0;
  private currentResponseItemId: string | null = null;
  private readonly toolCallsInResponse = new Set<string>();
  private readonly submittedToolOutputs = new Set<string>();
  private responseToolCallsClosed = false;

  protected abstract setState<K extends keyof RealtimeState>(
    key: K,
    value: RealtimeState[K],
  ): void;

  constructor(private readonly options: RealtimeSessionOptions) {
    const capabilities = options.model.capabilities;
    this.sessionLifecycle =
      capabilities?.startup === 'session-start' ||
      capabilities?.finalization === 'session-close';
    this.continuous = capabilities?.conversation === 'continuous';
    this.maxEvents = options.maxEvents ?? 500;
    if (!Number.isSafeInteger(this.maxEvents) || this.maxEvents < 1)
      throw new Error('maxEvents must be a positive integer');
    for (const timeout of [
      options.startupTimeoutMs ?? 30_000,
      options.closeTimeoutMs ?? 15_000,
    ]) {
      if (!Number.isFinite(timeout) || timeout <= 0 || timeout > 2_147_483_647)
        throw new Error(
          'Realtime timeouts must be positive finite timer durations',
        );
    }
    const budget = options.maxPlaybackBufferSeconds ?? 2;
    if (!Number.isFinite(budget) || budget <= 0)
      throw new Error('maxPlaybackBufferSeconds must be positive and finite');
    this.reducer = new RealtimeEventReducer(this.maxEvents);
    this.onToolCall = options.onToolCall;
    this.onEvent = options.onEvent;
    this.onError = options.onError;
  }

  private validateConnection(): void {
    const { model, api } = this.options;
    const connection =
      api.token != null ? 'client-secret-websocket' : 'server-websocket';
    if (
      !(
        model.capabilities?.connections ?? ['client-secret-websocket']
      ).includes(connection) ||
      (model.capabilities?.transports != null &&
        !model.capabilities.transports.includes('websocket'))
    )
      throw new Error(`Realtime model does not support ${connection}`);
    if (api.token != null && model.getWebSocketConfig == null)
      throw new Error(
        'Realtime model does not support client-secret WebSocket configuration',
      );
  }

  connect(): Promise<void>;
  connect(options: { stream?: MediaStream; capture?: boolean }): Promise<void>;
  async connect(connectOptions?: {
    stream?: MediaStream;
    capture?: boolean;
  }): Promise<void> {
    if (this.attempt?.active)
      throw new Error('Realtime session is already active');
    const attempt = new RealtimeAttempt();
    this.attempt = attempt;
    this.applyState({ ...this.state, status: 'connecting' });
    const current = () => this.attempt === attempt && attempt.active;
    try {
      this.validateConnection();
      const { model, api, sessionConfig } = this.options;
      this.suppliedStream = connectOptions?.stream;
      this.toolCallsInResponse.clear();
      this.submittedToolOutputs.clear();
      this.responseToolCallsClosed = false;
      if (this.sessionLifecycle)
        this.applyState({ ...this.state, session: createSessionState() });
      this.commands = new RealtimeCommandCoordinator({
        send: (event, guard) => this.sendTransport(event, guard),
        active: () =>
          current() &&
          this.state.status === 'connected' &&
          this.state.session?.delegationMode === 'provider',
        autoContinue: this.options.autoContinueTools ?? false,
        onError: error => {
          void this.reportError(error);
        },
      });
      attempt.timer('startup', this.options.startupTimeoutMs ?? 30_000, () =>
        this.fail(new Error('Realtime session startup timed out')),
      );
      const callbacks = {
        model,
        onEvent: async (event: RealtimeServerEvent) => {
          if (!current()) return;
          try {
            await this.handleServerEvent(event);
          } catch (error) {
            if (current())
              this.fail(error, (this.pcm ?? this.transport)?.finish());
          }
        },
        onError: (error: Error) => {
          if (current()) void this.reportError(error);
        },
        onFatalError: (error: Error, drain?: Promise<void>) => {
          if (current()) this.fail(error, drain);
        },
        onClosing: () => {
          if (!current()) return;
          attempt.closing = true;
          attempt.transportClosing = true;
          attempt.clearTimer('startup');
          attempt.clearTimer('close');
          this.applyState({ ...this.state, status: 'closing' });
        },
        onClose: (error?: Error) => {
          if (!current()) return;
          if (
            error != null &&
            (!attempt.ready ||
              (model.capabilities?.finalization === 'session-close' &&
                this.state.session?.finalization !== 'confirmed'))
          )
            this.fail(error);
          else if (!attempt.ready)
            this.fail(
              new Error('Realtime connection closed before becoming ready'),
            );
          else this.disconnect();
        },
        onCapturing: (isCapturing: boolean) => {
          if (current()) this.applyState({ ...this.state, isCapturing });
        },
        onPlaying: (isPlaying: boolean) => {
          if (current()) this.applyState({ ...this.state, isPlaying });
        },
      };
      if (
        api.websocket != null &&
        model.capabilities?.conversation === 'continuous'
      ) {
        this.pcm = new BrowserRealtimeLiveWebSocket({
          ...callbacks,
          sessionConfig,
          sampleRate: this.options.sampleRate,
          maxPlaybackBufferSeconds: this.options.maxPlaybackBufferSeconds,
        });
        this.pcm.connect({
          url: api.websocket,
          protocols: api.protocols,
          stream: connectOptions?.stream,
          capture: connectOptions?.capture,
        });
      } else {
        this.audio = new BrowserRealtimeAudio({
          captureSampleRate:
            sessionConfig?.inputAudioFormat?.rate ??
            this.options.sampleRate ??
            24000,
          playbackSampleRate:
            sessionConfig?.outputAudioFormat?.rate ??
            this.options.sampleRate ??
            24000,
          maxPlaybackSeconds: this.options.maxPlaybackBufferSeconds ?? 2,
          onAudio: audio => this.sendAutomaticAudio(audio),
          onError: callbacks.onError,
          onCapturingChange: callbacks.onCapturing,
          onPlayingChange: callbacks.onPlaying,
        });
        let config: RealtimeSessionConfig = sessionConfig ?? {};
        let token: string | undefined;
        let url = api.websocket;
        if (api.token != null) {
          const response = await fetch(api.token, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionConfig }),
            signal: attempt.abort.signal,
          });
          if (!response.ok)
            throw new Error(
              `Failed to fetch realtime setup: ${response.status}`,
            );
          const setup = await response.json();
          if (!current()) return;
          token = setup.token;
          url = setup.url;
          config = { ...sessionConfig, tools: setup.tools };
        }
        if (url == null) throw new Error('Realtime WebSocket URL is missing');
        this.audio.ensurePlaybackContext();
        this.transport = new BrowserRealtimeTransport({
          ...callbacks,
          onServerEvent: callbacks.onEvent,
        });
        this.transport.connect({
          token,
          url,
          protocols: api.protocols,
          onOpen: () =>
            this.sendTransport({
              type: model.capabilities?.startup ?? 'session-update',
              config,
            }),
        });
      }
    } catch (error) {
      if (current()) this.fail(error);
    }
  }

  private fail(error: unknown, drain?: Promise<void>): void {
    const attempt = this.attempt;
    if (attempt == null || !attempt.active || attempt.cause != null) return;
    attempt.cause = error instanceof Error ? error : new Error(String(error));
    this.applyState({ ...this.state, status: 'error' });
    this.stopAudioCapture();
    if (drain == null) this.disconnect();
    else void this.drainAttempt(attempt, drain);
    void this.reportError(attempt.cause);
  }

  private async drainAttempt(
    attempt: RealtimeAttempt,
    drain?: Promise<void>,
  ): Promise<void> {
    if (this.attempt === attempt && attempt.active)
      attempt.timer('drain', 1_000, () => this.finishAttempt(attempt));
    try {
      await drain;
    } catch {
      /* Finalize unconfirmed when draining fails. */
    }
    this.finishAttempt(attempt);
  }

  private finishAttempt(attempt: RealtimeAttempt): void {
    if (this.attempt !== attempt || !attempt.active) return;
    try {
      this.disconnect();
    } catch (error) {
      void this.reportError(error);
    }
  }

  private closeFailed(attempt: RealtimeAttempt, error: unknown): void {
    if (this.attempt !== attempt || !attempt.active || attempt.transportClosing)
      return;
    attempt.clearTimer('close');
    const transport = this.pcm ?? this.transport;
    void this.drainAttempt(attempt, transport?.finish());
    void this.reportError(error);
  }

  disconnect(): void {
    this.captureGeneration++;
    this.suppliedStream = undefined;
    this.attempt?.retire();
    this.transport?.dispose();
    this.audio?.dispose();
    this.pcm?.dispose();
    this.transport = undefined;
    this.audio = undefined;
    this.pcm = undefined;
    this.commands = undefined;
    const session = this.state.session;
    this.applyState({
      ...this.state,
      status: this.attempt?.cause != null ? 'error' : 'disconnected',
      isCapturing: false,
      isPlaying: false,
      ...(session != null
        ? {
            session:
              session.finalization === 'confirmed'
                ? session
                : { ...session, finalization: 'unconfirmed' },
          }
        : {}),
    });
  }

  /** Wait for final usage when the model supports a session-close acknowledgement. */
  close(options?: { eventId?: string }): Promise<void> {
    const attempt = this.attempt;
    if (attempt?.closePromise != null) return attempt.closePromise;
    if (
      this.state.status !== 'connected' ||
      this.options.model.capabilities?.finalization !== 'session-close' ||
      attempt == null
    ) {
      this.disconnect();
      return Promise.resolve();
    }
    if (options?.eventId != null) this.commands?.validateId(options.eventId);
    const promise = attempt.beginClose();
    this.applyState({ ...this.state, status: 'closing' });
    this.stopAudioCapture();
    attempt.timer('close', this.options.closeTimeoutMs ?? 15_000, () =>
      this.finishAttempt(attempt),
    );
    const failed = (error: unknown) => this.closeFailed(attempt, error);
    try {
      void this.commands
        ?.send({ type: 'session-close', eventId: options?.eventId })
        .catch(failed);
    } catch (error) {
      failed(error);
    }
    return promise;
  }

  private sendTransport(
    event: RealtimeClientEvent,
    guard?: () => boolean,
  ): Promise<void> {
    const transport = this.pcm ?? this.transport;
    if (transport == null) throw new Error('Realtime connection is not open');
    return transport.sendEvent(event, guard);
  }

  sendEvent(event: RealtimeClientEvent): Promise<void> {
    if (
      this.state.status === 'error' ||
      this.state.status === 'closing' ||
      !this.attempt?.active
    )
      throw new Error('Realtime session is not accepting submissions');
    if (this.sessionLifecycle && this.state.status !== 'connected')
      throw new Error('Realtime session is not accepting submissions');
    if (
      this.continuous &&
      (event.type === 'input-audio-commit' ||
        event.type === 'input-audio-clear')
    )
      throw new UnsupportedFunctionalityError({
        functionality:
          'JSON audio commands unsupported for this session transport',
      });
    if (event.type === 'session-close')
      return this.close({ eventId: event.eventId });
    if (event.type === 'session-start' && this.sessionLifecycle)
      throw new Error('Realtime session has already started');
    if (
      (event.type === 'backend-input-create' ||
        event.type === 'backend-response-create' ||
        event.type === 'backend-tool-result') &&
      this.state.session?.delegationMode !== 'provider'
    )
      throw new Error(
        'Backend commands require a session confirmed in provider delegation mode',
      );
    if (!this.sessionLifecycle && this.state.session == null)
      return this.sendTransport(event);
    return this.commands?.send(event) ?? this.sendTransport(event);
  }

  sendTextMessage(text: string): void {
    if (
      (this.continuous && this.state.session != null) ||
      this.state.session?.delegationMode === 'provider'
    ) {
      if (this.commands?.hasPendingTools())
        throw new Error(
          'Submit pending realtime tool results before sending a backend message',
        );
      const attempt = this.attempt;
      void this.sendEvent({
        type: 'backend-input-create',
        content: [{ type: 'text', text }],
      })
        .then(() => {
          if (attempt?.active && this.state.status === 'connected') {
            try {
              return this.sendEvent({ type: 'backend-response-create' });
            } catch (error) {
              void this.reportError(error);
            }
          }
        })
        .catch(() => {});
      return;
    }
    this.sendEvent({
      type: 'conversation-item-create',
      item: { type: 'text-message', role: 'user', text },
    });
    this.sendEvent({ type: 'response-create' });
    this.applyState(this.reducer.addUserTextMessage(this.state, text));
  }

  sendAudio(audio: string): void {
    this.sendEvent({ type: 'input-audio-append', audio });
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

  private sendAutomaticAudio(audio: string): void {
    if (this.state.status === 'connecting') return;
    const attempt = this.attempt;
    const failed = (error: unknown) => {
      if (attempt?.active && this.attempt === attempt) this.fail(error);
    };
    try {
      void this.sendEvent({ type: 'input-audio-append', audio }).catch(failed);
    } catch (error) {
      failed(error);
    }
  }

  addToolOutput(callId: string, result: unknown): void {
    if (
      this.commands?.hasToolCall(callId) ||
      (this.continuous && this.state.session != null)
    ) {
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
      item: { type: 'function-call-output', ...output },
    });
    this.submittedToolOutputs.add(callId);
    this.maybeRequestToolResponse();
  }

  private maybeRequestToolResponse(): void {
    if (
      this.state.status !== 'connected' ||
      !this.responseToolCallsClosed ||
      this.toolCallsInResponse.size === 0 ||
      [...this.toolCallsInResponse].some(
        id => !this.submittedToolOutputs.has(id),
      )
    )
      return;
    this.sendEvent({ type: 'response-create' });
    this.toolCallsInResponse.clear();
    this.submittedToolOutputs.clear();
    this.responseToolCallsClosed = false;
  }

  startAudioCapture(stream: MediaStream): void {
    this.suppliedStream = stream;
    const attempt = this.attempt;
    void this.resumeAudioCapture().catch(error => {
      if (attempt?.active) void this.reportError(error);
    });
  }

  async resumeAudioCapture(): Promise<void> {
    const accepting = () =>
      this.state.status === 'connected' ||
      (!this.sessionLifecycle && this.state.status === 'connecting');
    if (!accepting())
      throw new Error('Realtime session is not accepting capture');
    if (this.pcm != null) return this.pcm.resumeCapture(this.suppliedStream);
    const audio = this.audio;
    if (audio == null)
      throw new Error('Realtime capture transport is not ready');
    const captureGeneration = ++this.captureGeneration;
    const attempt = this.attempt;
    const supplied = this.suppliedStream;
    const stream =
      supplied ?? (await navigator.mediaDevices.getUserMedia({ audio: true }));
    if (
      !attempt?.active ||
      !accepting() ||
      captureGeneration !== this.captureGeneration
    ) {
      if (supplied == null) stream.getTracks().forEach(track => track.stop());
      return;
    }
    audio.startCapture(stream, {
      ownsStream: supplied == null || this.options.api.token != null,
    });
  }

  stopAudioCapture(): void {
    this.captureGeneration++;
    if (this.audio != null && this.options.api.token != null)
      this.suppliedStream = undefined;
    this.pcm?.stopCapture();
    this.audio?.stopCapture();
  }
  stopPlayback(): void {
    (this.pcm ?? this.audio)?.stopPlayback();
  }
  async resumePlayback(): Promise<void> {
    await (this.pcm ?? this.audio)?.resumePlayback();
  }
  dispose(): void {
    this.disconnect();
  }

  private applyState(nextState: RealtimeState): void {
    const previous = this.state;
    this.state = nextState;
    const update = <K extends keyof RealtimeState>(key: K) => {
      if (previous[key] !== nextState[key]) this.setState(key, nextState[key]);
    };
    update('status');
    update('messages');
    update('events');
    update('isCapturing');
    update('isPlaying');
    update('session');
  }

  private async executeTool(
    callId: string,
    name: string,
    args: unknown,
  ): Promise<void> {
    const attempt = this.attempt;
    if (!attempt?.active || attempt.closing || attempt.cause != null) return;
    try {
      if (this.onToolCall == null) {
        if (!this.continuous)
          void this.reportError(
            new Error(`No handler provided for tool "${name}"`),
          );
        return;
      }
      const result = await this.onToolCall({
        toolCall: { toolCallId: callId, toolName: name, args },
      });
      if (
        result !== undefined &&
        attempt?.active &&
        this.state.status === 'connected'
      )
        this.addToolOutput(callId, result);
    } catch (error) {
      if (attempt?.active) void this.reportError(error);
    }
  }

  private async handleServerEvent(event: RealtimeServerEvent): Promise<void> {
    const attempt = this.attempt;
    if (!attempt?.active) return;
    const command = await this.commands?.receive(event);
    if (!attempt.active) return;
    const result = await this.reducer.reduceServerEvent(this.state, event);
    if (!attempt.active) return;
    const session =
      this.state.session ??
      (event.type === 'session-started' ? createSessionState() : undefined);
    this.applyState({
      ...result.state,
      status: this.state.status,
      ...(session == null
        ? {}
        : {
            session: reduceSessionState(
              session,
              event,
              this.maxEvents,
              command?.muted,
            ),
          }),
    });
    for (const effect of result.effects) this.handleReducerEffect(effect);
    if (event.type === 'audio-chunk')
      (this.pcm ?? this.audio)?.playAudio(event.delta);
    if (event.type === 'response-done' && this.toolCallsInResponse.size > 0) {
      this.responseToolCallsClosed = true;
      this.maybeRequestToolResponse();
    }
    if (event.type === 'session-closed' && session != null) this.disconnect();
    if (
      (event.type === 'session-started' ||
        event.type === 'session-created' ||
        event.type === 'session-updated') &&
      attempt.active &&
      !attempt.closing &&
      attempt.cause == null
    ) {
      const ready =
        this.options.model.capabilities?.startup === 'session-start'
          ? event.type === 'session-started'
          : event.type !== 'session-started';
      if (ready) {
        attempt.ready = true;
        attempt.clearTimer('startup');
        this.applyState({ ...this.state, status: 'connected' });
        this.pcm?.startCapture();
      }
    }
    this.notifyEvent(event);
    const tool = command?.tool;
    if (tool != null && attempt.active && this.state.status === 'connected')
      void this.executeTool(tool.callId, tool.name, tool.args);
  }

  private handleReducerEffect(effect: RealtimeReducerEffect): void {
    switch (effect.type) {
      case 'play-audio':
        this.currentResponseItemId = effect.itemId;
        this.audio?.playAudio(effect.delta);
        break;
      case 'speech-started':
        if (this.state.isPlaying) {
          const playedMs = this.audio?.getPlaybackOffsetMs() ?? 0;
          this.audio?.stopPlayback();
          if (this.currentResponseItemId != null)
            this.sendEvent({
              type: 'conversation-item-truncate',
              itemId: this.currentResponseItemId,
              contentIndex: 0,
              audioEndMs: Math.round(playedMs),
            });
        }
        break;
      case 'tool-call':
        this.toolCallsInResponse.add(effect.callId);
        void this.executeTool(effect.callId, effect.name, effect.args);
        break;
      case 'error':
        void this.reportError(effect.error);
        break;
    }
  }

  private async reportError(error: unknown): Promise<void> {
    try {
      await this.onError?.(
        error instanceof Error ? error : new Error(String(error)),
      );
    } catch {
      /* Application callbacks cannot interrupt cleanup. */
    }
  }

  private notifyEvent(event: RealtimeServerEvent): void {
    try {
      void Promise.resolve(this.onEvent?.(event)).catch(error =>
        this.reportError(error),
      );
    } catch (error) {
      void this.reportError(error);
    }
  }
}
