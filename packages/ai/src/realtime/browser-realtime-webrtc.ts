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
  private finishing = false;
  private trackCleanups: Array<() => void> = [];

  constructor(
    private readonly options: {
      model: RealtimeModel;
      onEvent: (event: RealtimeServerEvent) => void | Promise<void>;
      onError: (error: Error) => void;
      onClose: () => void;
      onCapturing: (value: boolean) => void;
      onPlaying: (value: boolean) => void;
    },
  ) {}

  async connect({
    api,
    sessionConfig,
    stream,
    timeoutMs,
  }: {
    api: string;
    sessionConfig?: Partial<RealtimeSessionConfig>;
    /** Caller-owned tracks are detached, never stopped, on disconnect. */
    stream?: MediaStream;
    timeoutMs: number;
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
      const media =
        stream ?? (await navigator.mediaDevices.getUserMedia({ audio: true }));
      if (!current() || abort.signal.aborted) {
        if (stream == null) media.getTracks().forEach(track => track.stop());
        throw new Error('Realtime connection cancelled');
      }
      this.stream = media;
      this.ownsStream = stream == null;
      if (!media.getAudioTracks().some(track => track.readyState === 'live')) {
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
        if (
          current() &&
          (pc.connectionState === 'failed' ||
            pc.connectionState === 'closed' ||
            pc.connectionState === 'disconnected')
        ) {
          this.finish();
        }
      };
      const dc = pc.createDataChannel(config.dataChannelLabel);
      this.dc = dc;
      this.codec = new RealtimeEventChannel({
        model: this.options.model,
        onEvent: this.options.onEvent,
        onError: this.options.onError,
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
        if (current()) this.finish();
      };
      dc.onerror = () => {
        if (current())
          this.options.onError(new Error('Realtime data channel error'));
      };
      const opened = new Promise<void>(resolve => {
        dc.onopen = () => resolve();
      });
      const gathered = new Promise<void>(resolve => {
        pc.onicegatheringstatechange = () => {
          if (pc.iceGatheringState === 'complete') resolve();
        };
      });
      for (const track of media.getAudioTracks()) {
        pc.addTrack(track, media);
        const updateCapture = () => {
          if (current())
            this.options.onCapturing(
              media
                .getAudioTracks()
                .some(t => t.readyState === 'live' && t.enabled && !t.muted),
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
          .getAudioTracks()
          .some(
            track =>
              track.enabled && !track.muted && track.readyState === 'live',
          ),
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

  private finish(): void {
    if (this.finishing) return;
    this.finishing = true;
    const generation = this.generation;
    const complete = () => {
      if (generation !== this.generation) return;
      clearTimeout(this.finishTimer);
      this.options.onClose();
    };
    this.finishTimer = setTimeout(complete, 1_000);
    void (this.codec?.finish() ?? Promise.resolve()).then(complete);
  }

  dispose(): void {
    this.generation++;
    clearTimeout(this.finishTimer);
    this.finishing = false;
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
      this.pc.onicegatheringstatechange = null;
      this.pc.close();
      this.pc = undefined;
    }
    for (const cleanup of this.trackCleanups) cleanup();
    this.trackCleanups = [];
    if (this.ownsStream)
      this.stream?.getTracks().forEach(track => track.stop());
    this.stream = undefined;
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
