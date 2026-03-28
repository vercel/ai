import { safeParseJSON } from '@ai-sdk/provider-utils';
import {
  RealtimeClientEvent,
  RealtimeModel,
  RealtimeServerEvent,
  RealtimeSessionConfig,
} from '../types/realtime-model';
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
  model: RealtimeModel;
  api: {
    token: string;
    tools?: string;
  };
  sessionConfig?: Partial<RealtimeSessionConfig>;
  sampleRate?: number;
  maxEvents?: number;
  onEvent?: (event: RealtimeServerEvent) => void;
  onError?: (error: Error) => void;
};

export interface RealtimeState {
  status: RealtimeStatus;
  transcript: TranscriptEntry[];
  events: RealtimeServerEvent[];
  isCapturing: boolean;
  isPlaying: boolean;
}

export abstract class AbstractRealtimeSession {
  protected model: RealtimeModel;
  protected api: RealtimeSessionOptions['api'];
  protected sessionConfig: Partial<RealtimeSessionConfig> | undefined;
  protected sampleRate: number;
  private captureSampleRate: number;
  private playbackSampleRate: number;
  protected maxEvents: number;

  onEvent: ((event: RealtimeServerEvent) => void) | undefined;
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
  protected abstract pushEvent(event: RealtimeServerEvent): void;

  constructor(options: RealtimeSessionOptions) {
    this.model = options.model;
    this.api = options.api;
    this.sessionConfig = options.sessionConfig;
    this.sampleRate = options.sampleRate ?? 24000;
    this.captureSampleRate =
      options.sessionConfig?.inputAudioFormat?.rate ?? this.sampleRate;
    this.playbackSampleRate =
      options.sessionConfig?.outputAudioFormat?.rate ?? this.sampleRate;
    this.maxEvents = options.maxEvents ?? 500;
    this.onEvent = options.onEvent;
    this.onError = options.onError;
  }

  // ── Connection ─────────────────────────────────────────────────────

  async connect(): Promise<void> {
    this.setState('status', 'connecting');

    try {
      const toolDefinitions =
        this.api.tools != null
          ? await fetch(this.api.tools).then(res => {
              if (!res.ok) {
                throw new Error(
                  `Failed to fetch tool definitions: ${res.status}`,
                );
              }
              return res.json();
            })
          : [];

      const config: RealtimeSessionConfig = {
        ...this.sessionConfig,
        tools: toolDefinitions as RealtimeSessionConfig['tools'],
      };

      const tokenData = await fetch(this.api.token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionConfig: config }),
      }).then(res => {
        if (!res.ok) {
          throw new Error(`Failed to fetch realtime token: ${res.status}`);
        }
        return res.json();
      });

      const { token, url } = tokenData;

      if (this.playbackContext == null) {
        this.playbackContext = new AudioContext({
          sampleRate: this.playbackSampleRate,
        });
      }

      const wsConfig = this.model.getWebSocketConfig({ token, url });
      const ws = new WebSocket(wsConfig.url, wsConfig.protocols);

      ws.onopen = () => {
        this.ws = ws;

        this.sendRaw(
          this.model.serializeClientEvent({
            type: 'session-update',
            config,
          }),
        );
      };

      ws.onmessage = async messageEvent => {
        let text: string;
        if (typeof messageEvent.data === 'string') {
          text = messageEvent.data;
        } else if (messageEvent.data instanceof Blob) {
          text = await messageEvent.data.text();
        } else {
          text = new TextDecoder().decode(messageEvent.data);
        }

        const parseResult = await safeParseJSON({ text });
        if (!parseResult.success) return;

        const result = this.model.parseServerEvent(parseResult.value);
        const events = Array.isArray(result) ? result : [result];
        for (const event of events) {
          this.handleServerEvent(event);
        }
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

  sendEvent(event: RealtimeClientEvent): void {
    const serialized = this.model.serializeClientEvent(event);
    if (serialized != null) {
      this.sendRaw(serialized);
    }
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
    const targetRate = this.captureSampleRate;
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
      const buffer = ctx.createBuffer(
        1,
        samples.length,
        this.playbackSampleRate,
      );
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

  private async executeToolCall({
    name,
    args,
    callId,
  }: {
    name: string;
    args: string;
    callId: string;
  }): Promise<void> {
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
          name,
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

  private handleServerEvent(event: RealtimeServerEvent): void {
    this.pushEvent(event);
    this.onEvent?.(event);

    switch (event.type) {
      case 'session-created':
      case 'session-updated': {
        if (this.state.status === 'connecting') {
          this.setState('status', 'connected');
        }
        break;
      }

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
        this.executeToolCall({
          name: event.name,
          args: event.arguments,
          callId: event.callId,
        });
        break;
      }

      case 'error': {
        this.onError?.(new Error(event.message));
        break;
      }
    }
  }
}
