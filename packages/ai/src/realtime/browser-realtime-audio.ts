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

/**
 * One scheduled chunk of output audio. `itemOffset` is how many samples of the
 * same item were scheduled before this chunk.
 */
type ScheduledPlayback = {
  itemId: string | undefined;
  startTime: number;
  sampleCount: number;
  itemOffset: number;
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

  private playbackContext: AudioContext | null = null;
  private playbackQueue: Array<{
    samples: Float32Array;
    itemId: string | undefined;
  }> = [];
  private playbackTime = 0;
  private activeSources = new Map<AudioBufferSourceNode, ScheduledPlayback>();
  private scheduledItem: { id: string; samples: number } | undefined;
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
    this.ensurePlaybackContext();
    const context = this.playbackContext;
    if (this.playbackPaused) this.stopPlayback();
    if (this.playbackContext !== context) return;
    await context?.resume();
    if (this.playbackContext !== context) return;
    this.playbackPaused = false;
    this.setPlaying(
      this.playbackContext?.state === 'running' && this.activeSources.size > 0,
    );
  }

  startCapture(stream: MediaStream, options?: { ownsStream?: boolean }): void {
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
      if (this.captureContext === ctx) this.onError?.(error);
    });

    const source = ctx.createMediaStreamSource(stream);
    this.captureSource = source;

    const processor = ctx.createScriptProcessor(1024, 1, 1);
    this.captureProcessor = processor;

    processor.onaudioprocess = event => {
      if (this.captureContext !== ctx) return;
      const inputData = event.inputBuffer.getChannelData(0);
      const samples = resampleAudio(
        new Float32Array(inputData),
        ctx.sampleRate,
        this.captureSampleRate,
      );
      try {
        this.onAudio(encodeRealtimeAudio(samples));
      } catch (error) {
        this.onError?.(
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    };

    source.connect(processor);
    processor.connect(ctx.destination);
    const updateCapturing = () =>
      this.onCapturingChange(
        stream
          .getAudioTracks()
          .some(
            track =>
              track.enabled && !track.muted && track.readyState === 'live',
          ),
      );
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
    this.onCapturingChange(false);
  }

  playAudio(base64Audio: string, itemId?: string): void {
    if (this.playbackPaused) return;
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
      this.onError?.(
        new Error(
          'Realtime audio playback buffer is full; playback paused, call resumePlayback() to resume at the live edge',
        ),
      );
      return;
    }
    this.playbackQueue.push({ samples, itemId });
    this.schedulePlayback();
  }

  stopPlayback(): void {
    this.playbackQueue = [];

    for (const source of this.activeSources.keys()) {
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

  /**
   * The item the user is currently hearing and how far into that item
   * playback is, in whole milliseconds. Queued items play back to back, so
   * this is resolved from the scheduled chunk under the playback clock, not
   * from the most recently received item.
   */
  getPlaybackPosition(): { itemId: string; audioEndMs: number } | undefined {
    const ctx = this.playbackContext;
    if (ctx == null) return undefined;
    const now = ctx.currentTime;

    // Chunks are scheduled back to back, in insertion order. Take the latest
    // chunk that has started, or the first pending one if none has (an
    // `ended` event can fire marginally before the next chunk's start time).
    let current: ScheduledPlayback | undefined;
    for (const playback of this.activeSources.values()) {
      if (current != null && playback.startTime > now) break;
      current = playback;
    }
    if (current?.itemId == null) return undefined;

    const rate = this.playbackSampleRate;
    const played = Math.min(
      Math.max(now - current.startTime, 0),
      current.sampleCount / rate,
    );
    const heardMs = Math.round((current.itemOffset / rate + played) * 1000);
    // Never report more than the item's scheduled audio, rounded down:
    // providers reject a truncation past the end of the item.
    const scheduledMs = Math.floor(
      ((current.itemOffset + current.sampleCount) * 1000) / rate,
    );
    return {
      itemId: current.itemId,
      audioEndMs: Math.min(heardMs, scheduledMs),
    };
  }

  dispose(): void {
    this.stopCapture();
    this.stopPlayback();
    if (this.playbackContext != null) this.playbackContext.onstatechange = null;
    void this.playbackContext?.close().catch(() => {});
    this.playbackContext = null;
    this.playbackTime = 0;
    this.scheduledItem = undefined;
    this.playbackPaused = false;
  }

  private setPlaying(isPlaying: boolean): void {
    if (this.isPlaying !== isPlaying) {
      this.isPlaying = isPlaying;
      this.onPlayingChange(isPlaying);
    }
  }

  private schedulePlayback(): void {
    const ctx = this.playbackContext;
    if (ctx == null || this.playbackQueue.length === 0) return;

    while (this.playbackQueue.length > 0) {
      const { samples, itemId } = this.playbackQueue.shift()!;
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

      const itemOffset =
        itemId != null && this.scheduledItem?.id === itemId
          ? this.scheduledItem.samples
          : 0;
      if (itemId != null)
        this.scheduledItem = {
          id: itemId,
          samples: itemOffset + samples.length,
        };
      this.activeSources.set(source, {
        itemId,
        startTime,
        sampleCount: samples.length,
        itemOffset,
      });
      // Attach before publishing the playing state: a listener that stops
      // playback must find this source fully set up so it is detached.
      source.onended = () => {
        source.disconnect();
        this.activeSources.delete(source);
        if (this.playbackQueue.length === 0 && this.activeSources.size === 0) {
          this.setPlaying(false);
        }
      };
      this.setPlaying(ctx.state === 'running');
      if (this.playbackContext !== ctx) return;
    }
  }
}
