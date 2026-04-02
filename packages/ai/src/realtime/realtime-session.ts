import { safeParseJSON } from '@ai-sdk/provider-utils';
import {
  RealtimeClientEvent,
  RealtimeModel,
  RealtimeServerEvent,
  RealtimeSessionConfig,
} from '../types/realtime-model';
import { UIMessage, TextUIPart, DynamicToolUIPart } from '../ui/ui-messages';
import { decodeRealtimeAudio, encodeAudioForRealtime } from './audio-utils';

export type RealtimeStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error';

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

export interface RealtimeState {
  status: RealtimeStatus;
  messages: UIMessage[];
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

  onToolCall: RealtimeSessionOptions['onToolCall'];
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

  // Message tracking
  private currentAssistantMessageId: string | null = null;
  private textAccumulators: Map<string, string> = new Map();
  private toolArgAccumulators: Map<string, string> = new Map();
  private toolCallIdToMessageId: Map<string, string> = new Map();
  private itemIdToPartLocation: Map<
    string,
    { messageId: string; partIndex: number }
  > = new Map();

  protected abstract state: RealtimeState;
  protected abstract setState<K extends keyof RealtimeState>(
    key: K,
    value: RealtimeState[K],
  ): void;
  protected abstract pushMessage(message: UIMessage): void;
  protected abstract updateMessages(
    updater: (messages: UIMessage[]) => UIMessage[],
  ): void;
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
    this.onToolCall = options.onToolCall;
    this.onEvent = options.onEvent;
    this.onError = options.onError;
  }

  // ── Connection ─────────────────────────────────────────────────────

  async connect(): Promise<void> {
    this.setState('status', 'connecting');

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

      if (this.playbackContext == null) {
        this.playbackContext = new AudioContext({
          sampleRate: this.playbackSampleRate,
        });
      }

      const wsConfig = this.model.getWebSocketConfig({ token, url });
      const ws = new WebSocket(wsConfig.url, wsConfig.protocols);

      ws.onopen = () => {
        this.ws = ws;

        this.sendEvent({
          type: 'session-update',
          config,
        });
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

        if (this.model.getHealthCheckResponse != null) {
          const autoResponse = this.model.getHealthCheckResponse(
            parseResult.value,
          );
          if (autoResponse != null) {
            this.sendRaw(autoResponse);
          }
        }

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

    const message: UIMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      parts: [{ type: 'text', text, state: 'done' } as TextUIPart],
    };
    this.pushMessage(message);
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
    this.updateToolPartState(callId, result);

    this.sendEvent({
      type: 'conversation-item-create',
      item: {
        type: 'function-call-output',
        callId,
        output: JSON.stringify(result),
      },
    });

    this.sendEvent({ type: 'response-create' });
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

  // ── Private helpers ────────────────────────────────────────────────

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

  // ── Message helpers ───────────────────────────────────────────────

  private getOrCreateAssistantMessage(): string {
    if (this.currentAssistantMessageId != null) {
      return this.currentAssistantMessageId;
    }

    const id = `assistant-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    this.currentAssistantMessageId = id;

    const message: UIMessage = {
      id,
      role: 'assistant',
      parts: [],
    };
    this.pushMessage(message);
    return id;
  }

  private appendTextDelta(itemId: string, delta: string): void {
    const messageId = this.getOrCreateAssistantMessage();

    const acc = this.textAccumulators.get(itemId) ?? '';
    const newText = acc + delta;
    this.textAccumulators.set(itemId, newText);

    const location = this.itemIdToPartLocation.get(itemId);

    if (location != null) {
      // Update existing part
      this.updateMessages(messages =>
        messages.map(msg => {
          if (msg.id !== location.messageId) return msg;
          const newParts = [...msg.parts];
          newParts[location.partIndex] = {
            type: 'text',
            text: newText,
            state: 'streaming',
          } as TextUIPart;
          return { ...msg, parts: newParts };
        }),
      );
    } else {
      // Create new part and track its location
      this.updateMessages(messages =>
        messages.map(msg => {
          if (msg.id !== messageId) return msg;
          const partIndex = msg.parts.length;
          this.itemIdToPartLocation.set(itemId, { messageId, partIndex });
          return {
            ...msg,
            parts: [
              ...msg.parts,
              { type: 'text', text: newText, state: 'streaming' } as TextUIPart,
            ],
          };
        }),
      );
    }
  }

  private finalizeText(itemId: string, finalText?: string): void {
    const text = finalText ?? this.textAccumulators.get(itemId) ?? '';
    this.textAccumulators.delete(itemId);

    const location = this.itemIdToPartLocation.get(itemId);
    if (location == null) return;

    this.itemIdToPartLocation.delete(itemId);

    this.updateMessages(messages =>
      messages.map(msg => {
        if (msg.id !== location.messageId) return msg;
        const newParts = [...msg.parts];
        newParts[location.partIndex] = {
          type: 'text',
          text,
          state: 'done',
        } as TextUIPart;
        return { ...msg, parts: newParts };
      }),
    );
  }

  private updateToolPartState(callId: string, result: unknown): void {
    const messageId = this.toolCallIdToMessageId.get(callId);
    if (messageId == null) return;

    this.updateMessages(messages =>
      messages.map(msg => {
        if (msg.id !== messageId) return msg;

        const newParts = msg.parts.map(p => {
          if (p.type !== 'dynamic-tool') return p;
          const dp = p as DynamicToolUIPart;
          if (dp.toolCallId !== callId) return p;

          return {
            ...dp,
            state: 'output-available',
            output: result,
          } as DynamicToolUIPart;
        });

        return { ...msg, parts: newParts };
      }),
    );
  }

  private async executeToolCall(
    name: string,
    args: string,
    callId: string,
  ): Promise<void> {
    const parseResult = await safeParseJSON({ text: args });
    if (!parseResult.success) {
      this.onError?.(new Error(`Failed to parse tool arguments: ${args}`));
      return;
    }

    const parsedArgs = parseResult.value as Record<string, unknown>;

    // Try client-side onToolCall first
    if (this.onToolCall != null) {
      try {
        const result = await this.onToolCall({
          toolCall: { toolCallId: callId, toolName: name, args: parsedArgs },
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

    // Fall back to server-side tool execution
    if (this.api.tools == null) return;

    try {
      const response = await fetch(this.api.tools, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tools: {
            [callId]: { name, inputs: parsedArgs },
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

  // ── Event handling ────────────────────────────────────────────────

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
        this.appendTextDelta(event.itemId, event.delta);
        break;
      }

      case 'audio-transcript-done': {
        this.finalizeText(event.itemId, event.transcript);
        break;
      }

      case 'text-delta': {
        this.appendTextDelta(event.itemId, event.delta);
        break;
      }

      case 'text-done': {
        this.finalizeText(event.itemId, event.text);
        break;
      }

      case 'input-transcription-completed': {
        const message: UIMessage = {
          id: `user-${event.itemId}`,
          role: 'user',
          parts: [
            {
              type: 'text',
              text: event.transcript,
              state: 'done',
            } as TextUIPart,
          ],
        };
        this.pushMessage(message);
        break;
      }

      case 'response-created': {
        // Start a new assistant message for this response
        this.currentAssistantMessageId = null;
        break;
      }

      case 'response-done': {
        // Finalize current assistant message
        this.currentAssistantMessageId = null;
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
        // Finalize current assistant message on interruption
        this.currentAssistantMessageId = null;
        break;
      }

      case 'function-call-arguments-delta': {
        const messageId = this.getOrCreateAssistantMessage();
        this.toolCallIdToMessageId.set(event.callId, messageId);

        const acc = this.toolArgAccumulators.get(event.callId) ?? '';
        this.toolArgAccumulators.set(event.callId, acc + event.delta);

        // Find or create the DynamicToolUIPart
        this.updateMessages(messages =>
          messages.map(msg => {
            if (msg.id !== messageId) return msg;

            const existingPart = msg.parts.find(
              p =>
                p.type === 'dynamic-tool' &&
                (p as DynamicToolUIPart).toolCallId === event.callId,
            );

            if (existingPart != null) return msg;

            return {
              ...msg,
              parts: [
                ...msg.parts,
                {
                  type: 'dynamic-tool',
                  toolName: '',
                  toolCallId: event.callId,
                  state: 'input-streaming',
                  input: undefined,
                } as DynamicToolUIPart,
              ],
            };
          }),
        );
        break;
      }

      case 'function-call-arguments-done': {
        const messageId = this.toolCallIdToMessageId.get(event.callId);
        this.toolArgAccumulators.delete(event.callId);

        if (messageId != null) {
          const parsedInput = (() => {
            try {
              return JSON.parse(event.arguments);
            } catch {
              return {};
            }
          })();

          this.updateMessages(messages =>
            messages.map(msg => {
              if (msg.id !== messageId) return msg;

              const newParts = msg.parts.map(p => {
                if (p.type !== 'dynamic-tool') return p;
                const dp = p as DynamicToolUIPart;
                if (dp.toolCallId !== event.callId) return p;

                return {
                  ...dp,
                  toolName: event.name,
                  state: 'input-available',
                  input: parsedInput,
                } as DynamicToolUIPart;
              });

              return { ...msg, parts: newParts };
            }),
          );
        }

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
