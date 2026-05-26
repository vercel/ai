import type {
  RealtimeClientEvent,
  RealtimeModel,
  RealtimeServerEvent,
  RealtimeSessionConfig,
} from '../types/realtime-model';
import { BrowserRealtimeAudio } from './browser-realtime-audio';
import { BrowserRealtimeTransport } from './browser-realtime-transport';
import {
  createInitialRealtimeState,
  RealtimeEventReducer,
  type RealtimeReducerEffect,
  type RealtimeState,
  type RealtimeStatus,
} from './realtime-event-reducer';

export type { RealtimeState, RealtimeStatus };

export type RealtimeSessionOptions = {
  model: RealtimeModel;
  api: {
    token: string;
    tools?: string;
  };
  sessionConfig?: Partial<RealtimeSessionConfig>;
  sampleRate?: number;
  maxEvents?: number;
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
  private currentResponseItemId: string | null = null;

  protected abstract setState<K extends keyof RealtimeState>(
    key: K,
    value: RealtimeState[K],
  ): void;

  constructor(options: RealtimeSessionOptions) {
    this.model = options.model;
    this.api = options.api;
    this.sessionConfig = options.sessionConfig;
    this.maxEvents = options.maxEvents ?? 500;
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
        this.onError?.(error);
      },
      onClose: () => {
        this.applyState(this.reducer.setStatus(this.state, 'disconnected'));
      },
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

  async connect(): Promise<void> {
    this.applyState(this.reducer.setStatus(this.state, 'connecting'));

    try {
      const response = await fetch(this.api.token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionConfig: this.sessionConfig }),
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch realtime setup: ${response.status}`);
      }

      const setupData = await response.json();
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
      this.applyState(this.reducer.setStatus(this.state, 'error'));
      this.onError?.(
        error instanceof Error
          ? error
          : new Error(`Connection failed: ${String(error)}`),
      );
    }
  }

  disconnect(): void {
    this.transport.disconnect();
    this.applyState(this.reducer.setStatus(this.state, 'disconnected'));
  }

  // ── Sending events ─────────────────────────────────────────────────

  sendEvent(event: RealtimeClientEvent): void {
    this.transport.sendEvent(event);
  }

  sendTextMessage(text: string): void {
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

    this.sendEvent({ type: 'response-create' });
  }

  // ── Audio capture ──────────────────────────────────────────────────

  startAudioCapture(stream: MediaStream): void {
    this.audio.startCapture(stream);
  }

  stopAudioCapture(): void {
    this.audio.stopCapture();
  }

  // ── Playback ───────────────────────────────────────────────────────

  stopPlayback(): void {
    this.audio.stopPlayback();
  }

  // ── Cleanup ────────────────────────────────────────────────────────

  dispose(): void {
    this.transport.dispose();
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
    if (this.onToolCall != null) {
      try {
        const result = await this.onToolCall({
          toolCall: { toolCallId: callId, toolName: name, args },
        });

        if (result !== undefined) {
          this.addToolOutput(callId, result);
          return;
        }
      } catch (error) {
        this.onError?.(
          error instanceof Error
            ? error
            : new Error(`Client tool execution failed: ${String(error)}`),
        );
        return;
      }
    }

    if (this.api.tools == null) return;

    try {
      const response = await fetch(this.api.tools, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tools: {
            [callId]: { name, inputs: args },
          },
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        this.onError?.(
          new Error(
            `Tool execution request failed: ${response.status} ${text}`,
          ),
        );
        return;
      }

      const data = await response.json();
      const result = data[callId] ?? data;

      this.addToolOutput(callId, result);
    } catch (error) {
      this.onError?.(
        error instanceof Error
          ? error
          : new Error(`Tool execution failed: ${String(error)}`),
      );
    }
  }

  private async handleServerEvent(event: RealtimeServerEvent): Promise<void> {
    const result = await this.reducer.reduceServerEvent(this.state, event);
    this.applyState(result.state);
    this.onEvent?.(event);

    for (const effect of result.effects) {
      this.handleReducerEffect(effect);
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
        void this.executeToolCall({
          name: effect.name,
          args: effect.args,
          callId: effect.callId,
        });
        break;
      }
      case 'error': {
        this.onError?.(effect.error);
        break;
      }
    }
  }
}
