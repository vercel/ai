import {
  RealtimeModelV1,
  RealtimeModelV1ServerEvent,
  RealtimeModelV1SessionConfig,
} from '@ai-sdk/provider';
import { safeParseJSON } from '@ai-sdk/provider-utils';
import { decodeRealtimeAudio, encodeAudioForRealtime } from './audio-utils';

export type RealtimeStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error';

export type TranscriptEntry = {
  id: string;
  role: 'user' | 'assistant';
  type: 'text' | 'audio-transcript';
  content: string;
  timestamp: number;
};

export type RealtimeSessionOptions = {
  model: RealtimeModelV1;
  api: {
    token: string;
    tools?: string;
  };
  sessionConfig?: Partial<RealtimeModelV1SessionConfig>;
  sampleRate?: number;
  maxEvents?: number;
  onEvent?: (event: RealtimeModelV1ServerEvent) => void;
  onError?: (error: Error) => void;
};

export interface RealtimeState {
  status: RealtimeStatus;
  transcript: TranscriptEntry[];
  events: RealtimeModelV1ServerEvent[];
  isCapturing: boolean;
  isPlaying: boolean;
}

export abstract class AbstractRealtimeSession {
  protected model: RealtimeModelV1;
  protected api: RealtimeSessionOptions['api'];
  protected sessionConfig: Partial<RealtimeModelV1SessionConfig> | undefined;
  protected sampleRate: number;
  protected maxEvents: number;

  onEvent: ((event: RealtimeModelV1ServerEvent) => void) | undefined;
  onError: ((error: Error) => void) | undefined;

  private ws: WebSocket | null = null;

  private captureContext: AudioContext | null = null;
  private captureProcessor: ScriptProcessorNode | null = null;
  private captureSource: MediaStreamAudioSourceNode | null = null;

  private playbackContext: AudioContext | null = null;
  private playbackQueue: Float32Array[] = [];
  private playbackTime = 0;
  private playbackStartTime = 0;
  private activeSources = new Set<AudioBufferSourceNode>();
  private currentResponseItemId: string | null = null;

  private transcriptAcc: Record<string, string> = {};

  protected abstract state: RealtimeState;
  protected abstract setState<K extends keyof RealtimeState>(
    key: K,
    value: RealtimeState[K],
  ): void;
  protected abstract pushTranscript(entry: TranscriptEntry): void;
  protected abstract pushEvent(event: RealtimeModelV1ServerEvent): void;

  constructor(options: RealtimeSessionOptions) {
    this.model = options.model;
    this.api = options.api;
    this.sessionConfig = options.sessionConfig;
    this.sampleRate = options.sampleRate ?? 24000;
    this.maxEvents = options.maxEvents ?? 500;
    this.onEvent = options.onEvent;
    this.onError = options.onError;
  }

  // ── Connection ─────────────────────────────────────────────────────

  async connect(): Promise<void> {
    this.setState('status', 'connecting');

    try {
      const [toolDefinitions, tokenData] = await Promise.all([
        this.api.tools != null
          ? fetch(this.api.tools).then(res => {
              if (!res.ok) {
                throw new Error(
                  `Failed to fetch tool definitions: ${res.status}`,
                );
              }
              return res.json();
            })
          : Promise.resolve([]),
        fetch(this.api.token, { method: 'POST' }).then(res => {
          if (!res.ok) {
            throw new Error(`Failed to fetch realtime token: ${res.status}`);
          }
          return res.json();
        }),
      ]);

      const { token, url } = tokenData;

      if (this.playbackContext == null) {
        this.playbackContext = new AudioContext({
          sampleRate: this.sampleRate,
        });
      }

      const wsConfig = this.model.getWebSocketConfig({ token, url });
      const ws = new WebSocket(wsConfig.url, wsConfig.protocols);

      ws.onopen = () => {
        this.ws = ws;
        this.setState('status', 'connected');

        const config: RealtimeModelV1SessionConfig = {
          ...this.sessionConfig,
          tools: toolDefinitions as RealtimeModelV1SessionConfig['tools'],
        };

        this.sendRaw(
          this.model.serializeClientEvent({
            type: 'session-update',
            config,
          }),
        );
      };

      ws.onmessage = async messageEvent => {
        const text =
          typeof messageEvent.data === 'string'
            ? messageEvent.data
            : new TextDecoder().decode(messageEvent.data);

        const parseResult = await safeParseJSON({ text });
        if (!parseResult.success) return;

        const normalized = this.model.parseServerEvent(parseResult.value);
        this.handleServerEvent(normalized);
      };

      ws.onerror = () => {
        this.setState('status', 'error');
        this.onError?.(new Error('WebSocket connection error'));
      };

      ws.onclose = () => {
        this.ws = null;
        this.setState('status', 'disconnected');
      };
    } catch (error) {
      this.setState('status', 'error');
      this.onError?.(
        error instanceof Error
          ? error
          : new Error(`Connection failed: ${String(error)}`),
      );
    }
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
    this.setState('status', 'disconnected');
  }

  // ── Sending events ─────────────────────────────────────────────────

  sendEvent(
    event: Parameters<RealtimeModelV1['serializeClientEvent']>[0],
  ): void {
    this.sendRaw(this.model.serializeClientEvent(event));
  }

  sendTextMessage(text: string): void {
    this.sendEvent({
      type: 'conversation-item-create',
      item: { type: 'text-message', role: 'user', text },
    });
    this.sendEvent({ type: 'response-create' });

    this.pushTranscript({
      id: `user-${Date.now()}`,
      role: 'user',
      type: 'text',
      content: text,
      timestamp: Date.now(),
    });
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

  // ── Audio capture ──────────────────────────────────────────────────

  startAudioCapture(stream: MediaStream): void {
    const targetRate = this.sampleRate;
    const ctx = new AudioContext({ sampleRate: targetRate });
    this.captureContext = ctx;

    const source = ctx.createMediaStreamSource(stream);
    this.captureSource = source;

    const processor = ctx.createScriptProcessor(4096, 1, 1);
    this.captureProcessor = processor;

    processor.onaudioprocess = e => {
      const inputData = e.inputBuffer.getChannelData(0);

      let samples: Float32Array;
      if (ctx.sampleRate !== targetRate) {
        const ratio = ctx.sampleRate / targetRate;
        const outputLength = Math.round(inputData.length / ratio);
        samples = new Float32Array(outputLength);
        for (let i = 0; i < outputLength; i++) {
          const srcIndex = i * ratio;
          const srcFloor = Math.floor(srcIndex);
          const srcCeil = Math.min(srcFloor + 1, inputData.length - 1);
          const frac = srcIndex - srcFloor;
          samples[i] =
            inputData[srcFloor] * (1 - frac) + inputData[srcCeil] * frac;
        }
      } else {
        samples = new Float32Array(inputData);
      }

      const base64 = encodeAudioForRealtime(samples);
      this.sendEvent({ type: 'input-audio-append', audio: base64 });
    };

    source.connect(processor);
    processor.connect(ctx.destination);
    this.setState('isCapturing', true);
  }

  stopAudioCapture(): void {
    this.captureProcessor?.disconnect();
    this.captureSource?.disconnect();
    this.captureContext?.close();
    this.captureProcessor = null;
    this.captureSource = null;
    this.captureContext = null;
    this.setState('isCapturing', false);
  }

  // ── Playback ───────────────────────────────────────────────────────

  stopPlayback(): void {
    this.playbackQueue = [];

    for (const source of this.activeSources) {
      try {
        source.stop();
      } catch {
        // already stopped
      }
    }
    this.activeSources.clear();

    if (this.playbackContext != null) {
      this.playbackTime = this.playbackContext.currentTime;
    }
    this.setPlayingState(false);
  }

  // ── Cleanup ────────────────────────────────────────────────────────

  dispose(): void {
    this.ws?.close();
    this.captureContext?.close();
    this.playbackContext?.close();
  }

  // ── Private ────────────────────────────────────────────────────────

  private sendRaw(data: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  private setPlayingState(playing: boolean): void {
    if (playing && !this.state.isPlaying) {
      this.playbackStartTime = this.playbackContext?.currentTime ?? 0;
    }
    this.setState('isPlaying', playing);
  }

  private schedulePlayback(): void {
    const ctx = this.playbackContext;
    if (ctx == null || this.playbackQueue.length === 0) return;

    while (this.playbackQueue.length > 0) {
      const samples = this.playbackQueue.shift()!;
      const buffer = ctx.createBuffer(1, samples.length, this.sampleRate);
      buffer.getChannelData(0).set(samples);

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);

      const startTime = Math.max(this.playbackTime, ctx.currentTime);
      source.start(startTime);
      this.playbackTime = startTime + buffer.duration;

      this.activeSources.add(source);
      this.setPlayingState(true);

      source.onended = () => {
        this.activeSources.delete(source);
        if (this.playbackQueue.length === 0 && this.activeSources.size === 0) {
          this.setPlayingState(false);
        }
      };
    }
  }

  private async executeToolCall(
    name: string,
    args: string,
    callId: string,
  ): Promise<void> {
    if (this.api.tools == null) return;

    try {
      const parseResult = await safeParseJSON({ text: args });
      if (!parseResult.success) {
        this.onError?.(new Error(`Failed to parse tool arguments: ${args}`));
        return;
      }

      const response = await fetch(this.api.tools, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          arguments: parseResult.value,
          callId,
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

      this.sendEvent({
        type: 'conversation-item-create',
        item: {
          type: 'function-call-output',
          callId,
          output: JSON.stringify(data.result ?? data),
        },
      });

      this.sendEvent({ type: 'response-create' });
    } catch (error) {
      this.onError?.(
        error instanceof Error
          ? error
          : new Error(`Tool execution failed: ${String(error)}`),
      );
    }
  }

  private handleServerEvent(event: RealtimeModelV1ServerEvent): void {
    this.pushEvent(event);
    this.onEvent?.(event);

    switch (event.type) {
      case 'audio-delta': {
        const float32 = decodeRealtimeAudio(event.delta);
        this.currentResponseItemId = event.itemId;
        this.playbackQueue.push(float32);
        this.schedulePlayback();
        break;
      }

      case 'audio-transcript-delta': {
        const key = `assistant-${event.itemId}`;
        this.transcriptAcc[key] = (this.transcriptAcc[key] ?? '') + event.delta;
        break;
      }

      case 'audio-transcript-done': {
        const key = `assistant-${event.itemId}`;
        const content = event.transcript ?? this.transcriptAcc[key] ?? '';
        delete this.transcriptAcc[key];
        this.pushTranscript({
          id: event.itemId,
          role: 'assistant',
          type: 'audio-transcript',
          content,
          timestamp: Date.now(),
        });
        break;
      }

      case 'text-delta': {
        const key = `text-${event.itemId}`;
        this.transcriptAcc[key] = (this.transcriptAcc[key] ?? '') + event.delta;
        break;
      }

      case 'text-done': {
        const key = `text-${event.itemId}`;
        const content = event.text ?? this.transcriptAcc[key] ?? '';
        delete this.transcriptAcc[key];
        this.pushTranscript({
          id: event.itemId,
          role: 'assistant',
          type: 'text',
          content,
          timestamp: Date.now(),
        });
        break;
      }

      case 'input-transcription-completed': {
        this.pushTranscript({
          id: event.itemId,
          role: 'user',
          type: 'audio-transcript',
          content: event.transcript,
          timestamp: Date.now(),
        });
        break;
      }

      case 'speech-started': {
        if (this.state.isPlaying) {
          const ctx = this.playbackContext;
          const playedMs =
            ctx != null ? (ctx.currentTime - this.playbackStartTime) * 1000 : 0;
          this.stopPlayback();
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

      case 'function-call-arguments-done': {
        this.executeToolCall(event.name, event.arguments, event.callId);
        break;
      }

      case 'error': {
        this.onError?.(new Error(event.message));
        break;
      }
    }
  }
}
