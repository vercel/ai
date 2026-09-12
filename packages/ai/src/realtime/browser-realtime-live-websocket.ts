import { UnsupportedFunctionalityError } from '@ai-sdk/provider';
import type {
  RealtimeClientEvent,
  RealtimeModel,
  RealtimeServerEvent,
  RealtimeSessionConfig,
} from '../types/realtime-model';
import { BrowserRealtimeAudio } from './browser-realtime-audio';
import { BrowserRealtimeTransport } from './browser-realtime-transport';

/** Browser media for an application-owned raw protocol WebSocket relay. */
export class BrowserRealtimeLiveWebSocket {
  private readonly transport: BrowserRealtimeTransport;
  private readonly audio: BrowserRealtimeAudio;
  private readonly config: RealtimeSessionConfig;
  private generation = 0;
  private ready = false;
  private capturingStarted = false;
  private stream?: MediaStream;
  private pendingAudio = 0;
  private captureGeneration = 0;
  private captureEnabled = true;

  constructor(
    private readonly options: {
      model: RealtimeModel;
      sessionConfig?: Partial<RealtimeSessionConfig>;
      sampleRate?: number;
      maxPlaybackBufferSeconds?: number;
      onEvent: (event: RealtimeServerEvent) => Promise<void>;
      onError: (error: Error) => void;
      onFatalError: (error: Error, drain?: Promise<void>) => void;
      onClose: () => void;
      onCapturing: (value: boolean) => void;
      onPlaying: (value: boolean) => void;
    },
  ) {
    const input = options.sessionConfig?.inputAudioFormat;
    const output = options.sessionConfig?.outputAudioFormat;
    const sampleRate =
      input?.rate ?? output?.rate ?? options.sampleRate ?? 24000;
    const format = {
      type: input?.type ?? output?.type ?? 'audio/pcm',
      rate: sampleRate,
    };
    this.config = {
      ...options.sessionConfig,
      inputAudioFormat: {
        ...format,
        ...input,
      },
      outputAudioFormat: {
        ...format,
        ...output,
      },
    };
    this.transport = new BrowserRealtimeTransport({
      model: options.model,
      onServerEvent: options.onEvent,
      onError: options.onError,
      onFatalError: options.onFatalError,
      onClose: options.onClose,
    });
    this.audio = new BrowserRealtimeAudio({
      captureSampleRate: this.config.inputAudioFormat?.rate ?? sampleRate,
      playbackSampleRate: this.config.outputAudioFormat?.rate ?? sampleRate,
      maxPlaybackSeconds: options.maxPlaybackBufferSeconds ?? 2,
      onAudio: audio => this.sendAudio(audio),
      onError: options.onError,
      onCapturingChange: options.onCapturing,
      onPlayingChange: options.onPlaying,
    });
  }

  connect(options: {
    url: string;
    protocols?: string[];
    stream?: MediaStream;
    capture?: boolean;
  }): void {
    this.dispose();
    for (const format of [
      this.config.inputAudioFormat,
      this.config.outputAudioFormat,
    ]) {
      if (format?.type !== 'audio/pcm')
        throw new UnsupportedFunctionalityError({
          functionality:
            'Continuous browser WebSocket audio supports PCM16 only',
        });
      if (
        format.rate == null ||
        !Number.isFinite(format.rate) ||
        format.rate < 8000 ||
        format.rate > 96000
      )
        throw new Error('Invalid realtime PCM sample rate');
    }
    this.stream = options.stream;
    this.captureEnabled = options.capture !== false;
    // Create/resume playback while connect is still in the caller's user gesture.
    this.audio.ensurePlaybackContext();
    const generation = this.generation;
    void this.audio.resumePlayback().catch(error => {
      if (generation === this.generation) this.options.onError(error);
    });
    this.transport.connect({
      url: options.url,
      protocols: options.protocols,
      onOpen: () => {
        return this.transport.sendEvent({
          type: this.options.model.capabilities?.startup ?? 'session-update',
          config: this.config,
        });
      },
    });
  }

  startCapture(): void {
    this.ready = true;
    if (!this.captureEnabled || this.capturingStarted) return;
    void this.resumeCapture().catch(error => this.options.onError(error));
  }

  async resumeCapture(suppliedStream?: MediaStream): Promise<void> {
    this.stopCapture();
    this.ready = true;
    this.capturingStarted = true;
    this.captureEnabled = true;
    if (suppliedStream != null) this.stream = suppliedStream;
    const generation = this.captureGeneration;
    const supplied = this.stream;
    const stream =
      supplied ?? (await navigator.mediaDevices.getUserMedia({ audio: true }));
    if (generation !== this.captureGeneration || !this.ready) {
      if (supplied == null) stream.getTracks().forEach(track => track.stop());
      return;
    }
    if (!stream.getAudioTracks().some(track => track.readyState === 'live')) {
      if (supplied == null) stream.getTracks().forEach(track => track.stop());
      throw new Error('Realtime requires a live audio track');
    }
    this.audio.startCapture(stream, { ownsStream: supplied == null });
  }

  private sendAudio(audio: string): void {
    if (!this.ready || !this.transport.isOpen) return;
    if (this.pendingAudio >= 8) {
      this.options.onFatalError(new Error('Realtime audio send queue is full'));
      return;
    }
    const generation = this.generation;
    let sent: Promise<void>;
    try {
      sent = this.transport.sendEvent({ type: 'input-audio-append', audio });
    } catch (error) {
      if (!this.ready || !this.transport.isOpen) return;
      throw error;
    }
    this.pendingAudio++;
    void sent.then(
      () => {
        if (generation === this.generation) this.pendingAudio--;
      },
      error => {
        if (
          generation === this.generation &&
          this.ready &&
          this.transport.isOpen
        )
          this.options.onFatalError(error);
      },
    );
  }

  sendEvent(
    event: RealtimeClientEvent,
    shouldSend?: () => boolean,
  ): Promise<void> {
    if (event.type === 'session-update') {
      for (const key of ['inputAudioFormat', 'outputAudioFormat'] as const) {
        const update = event.config[key];
        if (
          update != null &&
          (update.type !== this.config[key]?.type ||
            (update.rate != null && update.rate !== this.config[key]?.rate))
        ) {
          throw new Error(
            'Changing Live WebSocket audio format requires reconnecting',
          );
        }
      }
    }
    return this.transport.sendEvent(event, shouldSend);
  }
  playAudio(audio: string): void {
    try {
      this.audio.playAudio(audio);
    } catch (error) {
      this.options.onError(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }
  stopPlayback(): void {
    this.audio.stopPlayback();
  }
  resumePlayback(): Promise<void> {
    return this.audio.resumePlayback();
  }

  stopCapture(): void {
    this.captureGeneration++;
    this.ready = false;
    this.capturingStarted = false;
    this.captureEnabled = false;
    this.audio.stopCapture();
  }

  finish(): Promise<void> {
    return this.transport.finish();
  }

  dispose(): void {
    this.stopCapture();
    this.generation++;
    this.ready = false;
    this.capturingStarted = false;
    this.pendingAudio = 0;
    this.stream = undefined;
    this.transport.disconnect();
    this.audio.dispose();
  }
}
