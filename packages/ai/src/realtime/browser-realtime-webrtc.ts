import { safeParseJSON } from '@ai-sdk/provider-utils';
import type {
  RealtimeClientEvent,
  RealtimeModel,
  RealtimeServerEvent,
  RealtimeSessionConfig,
} from '../types/realtime-model';
import { RealtimeEventChannel } from './realtime-event-channel';

export class BrowserRealtimeWebRTC {
  private pc?: RTCPeerConnection;
  private dc?: RTCDataChannel;
  private codec?: RealtimeEventChannel;
  private stream?: MediaStream;
  private ownsStream = false;
  private audio?: HTMLAudioElement;
  private abort?: AbortController;
  private generation = 0;
  private finishTimer?: ReturnType<typeof setTimeout>;
  private finishing?: 'close' | 'failure';
  private disconnectTimer?: ReturnType<typeof setTimeout>;
  private captureGeneration = 0;
  private sender?: RTCRtpSender;
  private rejectStartup?: (error: Error) => void;
  private trackCleanups: Array<() => void> = [];

  constructor(
    private readonly options: {
      model: RealtimeModel;
      onEvent: (event: RealtimeServerEvent) => void | Promise<void>;
      onError: (error: Error) => void;
      onFatalError?: (error: Error, drain?: Promise<void>) => void;
      disconnectTimeoutMs?: number;
      onClose: (error?: Error) => void;
      onClosing?: () => void;
      onCapturing: (value: boolean) => void;
      onPlaying: (value: boolean) => void;
    },
  ) {}

  async connect({
    api,
    sessionConfig,
    stream,
    timeoutMs,
    capture = true,
  }: {
    api: string;
    sessionConfig?: Partial<RealtimeSessionConfig>;
    /** Caller-owned tracks are detached, never stopped, on disconnect. */
    stream?: MediaStream;
    timeoutMs: number;
    capture?: boolean;
  }): Promise<void> {
    this.dispose();
    const config = this.options.model.getWebRTCConfig?.();
    if (config == null)
      throw new Error('This model does not support WebRTC configuration');
    const generation = this.generation;
    const current = () => generation === this.generation;
    const abort = new AbortController();
    this.abort = abort;
    const timeout = setTimeout(
      () => abort.abort(new Error('Realtime startup timed out')),
      timeoutMs,
    );
    const cancelled = new Promise<never>((_, reject) => {
      abort.signal.addEventListener(
        'abort',
        () => reject(abort.signal.reason),
        { once: true },
      );
    });
    const start = async () => {
      const captureGeneration = this.captureGeneration;
      let media = capture
        ? (stream ??
          (await navigator.mediaDevices.getUserMedia({ audio: true })))
        : undefined;
      if (!current() || abort.signal.aborted) {
        if (stream == null) media?.getTracks().forEach(track => track.stop());
        throw new Error('Realtime connection cancelled');
      }
      if (captureGeneration !== this.captureGeneration) {
        if (stream == null) media?.getTracks().forEach(track => track.stop());
        media = undefined;
      }
      this.stream = media;
      this.ownsStream = stream == null;
      if (
        media != null &&
        !media.getAudioTracks().some(track => track.readyState === 'live')
      ) {
        throw new Error('Realtime requires a live audio track');
      }
      const pc = new RTCPeerConnection();
      this.pc = pc;
      const audio = document.createElement('audio');
      audio.autoplay = true;
      this.audio = audio;
      audio.onplaying = () => {
        if (current()) this.options.onPlaying(true);
      };
      const stopped = () => {
        if (current()) this.options.onPlaying(false);
      };
      audio.onpause = stopped;
      audio.onended = stopped;
      audio.onwaiting = stopped;
      pc.ontrack = event => {
        if (!current()) return;
        audio.srcObject = event.streams[0] ?? new MediaStream([event.track]);
        void audio.play().catch(error => {
          if (current()) this.options.onError(error);
        });
      };
      pc.onconnectionstatechange = () => {
        if (!current()) return;
        if (pc.connectionState === 'connected')
          clearTimeout(this.disconnectTimer);
        else if (pc.connectionState === 'disconnected') {
          clearTimeout(this.disconnectTimer);
          this.disconnectTimer = setTimeout(() => {
            if (current() && pc.connectionState === 'disconnected')
              this.fail(
                new Error(
                  'Realtime peer disconnected beyond recovery grace period',
                ),
              );
          }, this.options.disconnectTimeoutMs ?? 5_000);
        } else if (pc.connectionState === 'closed') {
          this.drainClose(new Error('Realtime peer connection closed'));
        } else if (pc.connectionState === 'failed') {
          this.fail(
            new Error(`Realtime peer connection ${pc.connectionState}`),
          );
        }
      };
      pc.oniceconnectionstatechange = () => {
        if (current() && pc.iceConnectionState === 'failed')
          this.fail(new Error('Realtime ICE connection failed'));
      };
      const dc = pc.createDataChannel(config.dataChannelLabel);
      this.dc = dc;
      this.codec = new RealtimeEventChannel({
        model: this.options.model,
        onEvent: this.options.onEvent,
        onError: this.options.onError,
        onFatalError: error => this.fail(error),
        send: data => {
          if (!current() || dc.readyState !== 'open')
            throw new Error('Realtime data channel is not open');
          if (dc.bufferedAmount > 1024 * 1024)
            throw new Error('Realtime data channel buffer is full');
          dc.send(typeof data === 'string' ? data : JSON.stringify(data));
        },
      });
      dc.onmessage = event => {
        if (current()) this.codec?.receive(event.data);
      };
      dc.onclose = () => {
        if (current())
          this.drainClose(new Error('Realtime data channel closed'));
      };
      dc.onerror = () => {
        if (current()) this.fail(new Error('Realtime data channel error'));
      };
      const opened = new Promise<void>((resolve, reject) => {
        this.rejectStartup = reject;
        dc.onopen = () => {
          this.rejectStartup = undefined;
          resolve();
        };
      });
      void opened.catch(() => {});
      const gathered = new Promise<void>(resolve => {
        pc.onicegatheringstatechange = () => {
          if (pc.iceGatheringState === 'complete') resolve();
        };
      });
      if (media == null)
        this.sender = pc.addTransceiver('audio', {
          direction: 'sendrecv',
        }).sender;
      for (const track of media
        ?.getAudioTracks()
        .filter(track => track.readyState === 'live')
        .slice(0, 1) ?? []) {
        this.sender = pc.addTrack(track, media as MediaStream);
        const updateCapture = () => {
          if (current())
            this.options.onCapturing(
              track.readyState === 'live' && track.enabled && !track.muted,
            );
        };
        for (const event of ['ended', 'mute', 'unmute']) {
          track.addEventListener(event, updateCapture);
          this.trackCleanups.push(() =>
            track.removeEventListener(event, updateCapture),
          );
        }
      }
      this.options.onCapturing(
        media
          ?.getAudioTracks()
          .some(
            track =>
              track.enabled && !track.muted && track.readyState === 'live',
          ) ?? false,
      );
      const offer = await pc.createOffer();
      if (!current() || abort.signal.aborted) return;
      await pc.setLocalDescription(offer);
      if (pc.iceGatheringState !== 'complete')
        await Promise.race([gathered, cancelled]);
      if (!current() || abort.signal.aborted) return;
      const sdp = pc.localDescription?.sdp;
      if (sdp == null) throw new Error('Realtime offer has no SDP');
      const response = await fetch(api, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sdp, sessionConfig }),
        signal: abort.signal,
      });
      if (!response.ok)
        throw new Error(
          `Failed to create realtime session: ${response.status}`,
        );
      const parsed = await safeParseJSON({ text: await response.text() });
      if (!current() || abort.signal.aborted) return;
      if (
        !parsed.success ||
        typeof parsed.value !== 'object' ||
        parsed.value == null ||
        !('sdp' in parsed.value) ||
        typeof parsed.value.sdp !== 'string' ||
        !('sessionId' in parsed.value) ||
        typeof parsed.value.sessionId !== 'string'
      ) {
        throw new Error('Invalid realtime session answer');
      }
      await pc.setRemoteDescription({ type: 'answer', sdp: parsed.value.sdp });
      await Promise.race([opened, cancelled]);
    };
    try {
      await Promise.race([start(), cancelled]);
    } catch (error) {
      if (current()) this.dispose();
      throw error;
    } finally {
      clearTimeout(timeout);
      this.rejectStartup = undefined;
    }
  }

  sendEvent(
    event: RealtimeClientEvent,
    shouldSend?: () => boolean,
  ): Promise<void> {
    if (this.dc?.readyState !== 'open')
      throw new Error('Realtime data channel is not open');
    return this.codec?.send(event, shouldSend) ?? Promise.resolve();
  }

  async resumePlayback(): Promise<void> {
    if (this.audio == null)
      throw new Error('Realtime playback is not connected');
    await this.audio.play();
  }

  stopPlayback(): void {
    this.audio?.pause();
  }

  finish(): Promise<void> {
    return this.codec?.finish() ?? Promise.resolve();
  }

  private fail(error: Error): void {
    if (this.finishing === 'failure') return;
    this.finishing = 'failure';
    clearTimeout(this.finishTimer);
    if (this.rejectStartup != null) {
      this.rejectStartup(error);
      this.abort?.abort(error);
      return;
    }
    void this.stopCaptureForShutdown(this.generation);
    const drain = this.finish();
    if (this.options.onFatalError != null) {
      this.options.onFatalError(error, drain);
      return;
    }
    const generation = this.generation;
    const complete = () => {
      if (generation !== this.generation) return;
      this.dispose();
      try {
        this.options.onClose();
      } catch (cause) {
        this.reportCallbackError(cause);
      }
    };
    this.finishTimer = setTimeout(complete, 1_000);
    void this.awaitDrain(drain, complete);
    try {
      this.options.onError(error);
    } catch {
      /* Cleanup is already scheduled. */
    }
  }

  private drainClose(error: Error): void {
    if (this.finishing) return;
    if (this.rejectStartup != null) {
      this.fail(error);
      return;
    }
    this.finishing = 'close';
    const generation = this.generation;
    const complete = () => {
      if (generation !== this.generation || this.finishing !== 'close') return;
      clearTimeout(this.finishTimer);
      try {
        this.options.onClose(error);
      } catch (cause) {
        this.reportCallbackError(cause);
      } finally {
        if (generation === this.generation) this.dispose();
      }
    };
    this.finishTimer = setTimeout(complete, 1_000);
    void this.awaitDrain(this.finish(), complete);
    void this.stopCaptureForShutdown(generation);
    this.options.onClosing?.();
  }

  private async stopCaptureForShutdown(generation: number): Promise<void> {
    try {
      await this.stopCapture();
    } catch (cause) {
      if (generation !== this.generation || this.finishing !== 'close') return;
      try {
        this.fail(cause instanceof Error ? cause : new Error(String(cause)));
      } catch (error) {
        this.reportCallbackError(error);
      }
    }
  }

  private async awaitDrain(
    drain: Promise<void>,
    complete: () => void,
  ): Promise<void> {
    try {
      await drain;
    } catch {
      /* Transport loss still requires finalization. */
    }
    try {
      complete();
    } catch (error) {
      this.reportCallbackError(error);
    }
  }

  private reportCallbackError(error: unknown): void {
    try {
      this.options.onError(
        error instanceof Error ? error : new Error(String(error)),
      );
    } catch {
      /* Application callbacks cannot interrupt teardown. */
    }
  }

  async stopCapture(): Promise<void> {
    this.captureGeneration++;
    for (const cleanup of this.trackCleanups) cleanup();
    this.trackCleanups = [];
    if (this.ownsStream)
      this.stream?.getTracks().forEach(track => track.stop());
    this.stream = undefined;
    this.options.onCapturing(false);
    await this.sender?.replaceTrack(null);
  }

  async startCapture(supplied?: MediaStream): Promise<void> {
    const stopped = this.stopCapture();
    const generation = this.captureGeneration;
    await stopped;
    if (
      generation !== this.captureGeneration ||
      this.pc == null ||
      this.finishing
    )
      return;
    const media =
      supplied ?? (await navigator.mediaDevices.getUserMedia({ audio: true }));
    if (
      generation !== this.captureGeneration ||
      this.pc == null ||
      this.finishing
    ) {
      if (supplied == null) media.getTracks().forEach(track => track.stop());
      return;
    }
    const track = media
      .getAudioTracks()
      .find(track => track.readyState === 'live');
    if (track == null) {
      if (supplied == null) media.getTracks().forEach(track => track.stop());
      throw new Error('Realtime requires a live audio track');
    }
    try {
      await this.sender?.replaceTrack(track);
    } catch (error) {
      if (supplied == null) media.getTracks().forEach(track => track.stop());
      throw error;
    }
    if (generation !== this.captureGeneration) {
      if (supplied == null) media.getTracks().forEach(track => track.stop());
      return;
    }
    this.stream = media;
    this.ownsStream = supplied == null;
    const update = () =>
      this.options.onCapturing(
        track.readyState === 'live' && track.enabled && !track.muted,
      );
    for (const event of ['ended', 'mute', 'unmute']) {
      track.addEventListener(event, update);
      this.trackCleanups.push(() => track.removeEventListener(event, update));
    }
    update();
  }

  dispose(): void {
    this.generation++;
    this.captureGeneration++;
    clearTimeout(this.finishTimer);
    clearTimeout(this.disconnectTimer);
    this.finishing = undefined;
    this.abort?.abort(new Error('Realtime connection cancelled'));
    this.abort = undefined;
    this.codec?.dispose();
    this.codec = undefined;
    if (this.dc != null) {
      this.dc.onopen = null;
      this.dc.onclose = null;
      this.dc.onerror = null;
      this.dc.onmessage = null;
      this.dc.close();
      this.dc = undefined;
    }
    if (this.pc != null) {
      this.pc.ontrack = null;
      this.pc.onconnectionstatechange = null;
      this.pc.oniceconnectionstatechange = null;
      this.pc.onicegatheringstatechange = null;
      this.pc.close();
      this.pc = undefined;
    }
    for (const cleanup of this.trackCleanups) cleanup();
    this.trackCleanups = [];
    if (this.ownsStream)
      this.stream?.getTracks().forEach(track => track.stop());
    this.stream = undefined;
    this.sender = undefined;
    if (this.audio != null) {
      this.audio.onplaying = null;
      this.audio.onpause = null;
      this.audio.onended = null;
      this.audio.onwaiting = null;
      this.audio.pause();
      this.audio.srcObject = null;
      this.audio = undefined;
    }
    this.options.onCapturing(false);
    this.options.onPlaying(false);
  }
}
