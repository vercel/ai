import {
  decodeRealtimeAudio,
  encodeRealtimeAudio,
  resampleAudio,
} from './audio-utils';

export type BrowserRealtimeAudioOptions = {
  captureSampleRate: number;
  playbackSampleRate: number;
  onAudio: (base64Audio: string) => void;
  onPlayingChange: (isPlaying: boolean) => void;
  onCapturingChange: (isCapturing: boolean) => void;
  maxPlaybackSeconds?: number;
  onError?: (error: Error) => void;
};

export class BrowserRealtimeAudio {
  private readonly captureSampleRate: number;
  private readonly playbackSampleRate: number;
  private readonly onAudio: BrowserRealtimeAudioOptions['onAudio'];
  private readonly onPlayingChange: BrowserRealtimeAudioOptions['onPlayingChange'];
  private readonly onCapturingChange: BrowserRealtimeAudioOptions['onCapturingChange'];

  private captureContext: AudioContext | null = null;
  private captureProcessor: ScriptProcessorNode | null = null;
  private captureSource: MediaStreamAudioSourceNode | null = null;
  private captureStream: MediaStream | null = null;
  private ownsCaptureStream = true;
  private captureCleanup: Array<() => void> = [];
  private captureGeneration = 0;
  private retired = false;

  private playbackContext: AudioContext | null = null;
  private playbackQueue: Float32Array[] = [];
  private playbackTime = 0;
  private playbackStartTime = 0;
  private activeSources = new Set<AudioBufferSourceNode>();
  private isPlaying = false;
  private playbackPaused = false;
  private readonly maxPlaybackSeconds: number;
  private readonly onError: ((error: Error) => void) | undefined;

  constructor(options: BrowserRealtimeAudioOptions) {
    this.captureSampleRate = options.captureSampleRate;
    this.playbackSampleRate = options.playbackSampleRate;
    this.onAudio = options.onAudio;
    this.onPlayingChange = options.onPlayingChange;
    this.maxPlaybackSeconds = options.maxPlaybackSeconds ?? Infinity;
    this.onError = options.onError;
    this.onCapturingChange = options.onCapturingChange;
  }

  ensurePlaybackContext(): void {
    if (this.retired) return;
    if (this.playbackContext == null) {
      this.playbackContext = new AudioContext({
        sampleRate: this.playbackSampleRate,
      });
      const context = this.playbackContext;
      context.onstatechange = () => {
        if (this.playbackContext === context)
          this.setPlaying(
            context.state === 'running' && this.activeSources.size > 0,
          );
      };
    }
  }

  async resumePlayback(): Promise<void> {
    if (this.retired) return;
    this.ensurePlaybackContext();
    const context = this.playbackContext;
    if (this.playbackPaused) this.stopPlayback();
    if (this.retired || this.playbackContext !== context) return;
    await context?.resume();
    if (this.retired || this.playbackContext !== context) return;
    this.playbackPaused = false;
    this.setPlaying(
      this.playbackContext?.state === 'running' && this.activeSources.size > 0,
    );
  }

  startCapture(stream: MediaStream, options?: { ownsStream?: boolean }): void {
    if (this.retired) return;
    const generation = this.captureGeneration + 1;
    this.stopCapture();
    if (generation !== this.captureGeneration) {
      if (options?.ownsStream ?? true)
        stream.getTracks().forEach(track => track.stop());
      return;
    }
    this.captureStream = stream;
    this.ownsCaptureStream = options?.ownsStream ?? true;
    const ctx = new AudioContext({ sampleRate: this.captureSampleRate });
    this.captureContext = ctx;
    void ctx.resume().catch(error => {
      if (!this.retired && this.captureContext === ctx) this.onError?.(error);
    });

    const source = ctx.createMediaStreamSource(stream);
    this.captureSource = source;

    const processor = ctx.createScriptProcessor(1024, 1, 1);
    this.captureProcessor = processor;

    processor.onaudioprocess = event => {
      if (this.retired || this.captureContext !== ctx) return;
      const inputData = event.inputBuffer.getChannelData(0);
      const samples = resampleAudio(
        new Float32Array(inputData),
        ctx.sampleRate,
        this.captureSampleRate,
      );
      try {
        this.onAudio(encodeRealtimeAudio(samples));
      } catch (error) {
        if (this.retired) return;
        this.onError?.(
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    };

    source.connect(processor);
    processor.connect(ctx.destination);
    const updateCapturing = () => {
      if (this.retired || this.captureStream !== stream) return;
      this.onCapturingChange(
        stream
          .getAudioTracks()
          .some(
            track =>
              track.enabled && !track.muted && track.readyState === 'live',
          ),
      );
    };
    for (const track of stream.getAudioTracks()) {
      for (const event of ['ended', 'mute', 'unmute']) {
        track.addEventListener(event, updateCapturing);
        this.captureCleanup.push(() =>
          track.removeEventListener(event, updateCapturing),
        );
      }
    }
    updateCapturing();
  }

  stopCapture(): void {
    this.captureGeneration++;
    if (this.captureProcessor != null)
      this.captureProcessor.onaudioprocess = null;
    for (const cleanup of this.captureCleanup) cleanup();
    this.captureCleanup = [];
    this.captureProcessor?.disconnect();
    this.captureSource?.disconnect();
    void this.captureContext?.close().catch(() => {});
    if (this.ownsCaptureStream)
      this.captureStream?.getTracks().forEach(track => track.stop());

    this.captureProcessor = null;
    this.captureSource = null;
    this.captureContext = null;
    this.captureStream = null;
    if (!this.retired) this.onCapturingChange(false);
  }

  playAudio(base64Audio: string): void {
    if (this.retired || this.playbackPaused) return;
    this.ensurePlaybackContext();
    const samples = decodeRealtimeAudio(base64Audio);
    if (
      Math.max(
        0,
        this.playbackTime - (this.playbackContext?.currentTime ?? 0),
      ) +
        samples.length / this.playbackSampleRate >
      this.maxPlaybackSeconds
    ) {
      this.playbackPaused = true;
      this.stopPlayback();
      if (this.retired) return;
      this.onError?.(
        new Error(
          'Realtime audio playback buffer is full; playback paused, call resumePlayback() to resume at the live edge',
        ),
      );
      return;
    }
    this.playbackQueue.push(samples);
    this.schedulePlayback();
  }

  stopPlayback(): void {
    this.playbackQueue = [];

    for (const source of this.activeSources) {
      try {
        source.onended = null;
        source.stop();
        source.disconnect();
      } catch {
        // Source may already be stopped by the browser.
      }
    }
    this.activeSources.clear();

    if (this.playbackContext != null) {
      this.playbackTime = this.playbackContext.currentTime;
    }
    this.setPlaying(false);
  }

  getPlaybackOffsetMs(): number {
    const ctx = this.playbackContext;
    if (ctx == null) return 0;
    return (ctx.currentTime - this.playbackStartTime) * 1000;
  }

  /** Defer browser cleanup while silencing capture and playback continuations. */
  retire(): void {
    this.retired = true;
    this.captureGeneration++;
  }

  dispose(): void {
    this.stopCapture();
    this.stopPlayback();
    if (this.playbackContext != null) this.playbackContext.onstatechange = null;
    void this.playbackContext?.close().catch(() => {});
    this.playbackContext = null;
    this.playbackTime = 0;
    this.playbackPaused = false;
    this.isPlaying = false;
    this.retired = false;
  }

  private setPlaying(isPlaying: boolean): void {
    if (this.retired) return;
    if (isPlaying && !this.isPlaying) {
      this.playbackStartTime = this.playbackContext?.currentTime ?? 0;
    }
    if (this.isPlaying !== isPlaying) {
      this.isPlaying = isPlaying;
      this.onPlayingChange(isPlaying);
    }
  }

  private schedulePlayback(): void {
    const ctx = this.playbackContext;
    if (this.retired || ctx == null || this.playbackQueue.length === 0) return;

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
      this.setPlaying(ctx.state === 'running');
      if (this.retired || this.playbackContext !== ctx) return;

      source.onended = () => {
        if (this.retired || this.playbackContext !== ctx) return;
        source.disconnect();
        this.activeSources.delete(source);
        if (this.playbackQueue.length === 0 && this.activeSources.size === 0) {
          this.setPlaying(false);
        }
      };
    }
  }
}
