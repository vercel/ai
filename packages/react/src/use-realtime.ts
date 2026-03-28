import {
  AbstractRealtimeSession,
  type RealtimeModelV1ServerEvent,
  type RealtimeSessionOptions,
  type RealtimeState,
  type RealtimeStatus,
  type TranscriptEntry,
} from 'ai';
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';

export type { RealtimeStatus, TranscriptEntry };

export type UseRealtimeOptions = RealtimeSessionOptions;

type RealtimeStateKey = keyof RealtimeState;

class RealtimeStore extends AbstractRealtimeSession {
  protected state: RealtimeState = {
    status: 'disconnected',
    transcript: [],
    events: [],
    isCapturing: false,
    isPlaying: false,
  };

  private callbacks: { [K in RealtimeStateKey]: Set<() => void> } = {
    status: new Set(),
    transcript: new Set(),
    events: new Set(),
    isCapturing: new Set(),
    isPlaying: new Set(),
  };

  get status(): RealtimeStatus {
    return this.state.status;
  }

  get transcript(): TranscriptEntry[] {
    return this.state.transcript;
  }

  get events(): RealtimeModelV1ServerEvent[] {
    return this.state.events;
  }

  get isCapturing(): boolean {
    return this.state.isCapturing;
  }

  get isPlaying(): boolean {
    return this.state.isPlaying;
  }

  subscribe(key: RealtimeStateKey, onChange: () => void): () => void {
    this.callbacks[key].add(onChange);

    return () => {
      this.callbacks[key].delete(onChange);
    };
  }

  protected setState<K extends RealtimeStateKey>(
    key: K,
    value: RealtimeState[K],
  ): void {
    this.state = { ...this.state, [key]: value };
    this.callbacks[key].forEach(callback => callback());
  }

  protected pushTranscript(entry: TranscriptEntry): void {
    this.state = {
      ...this.state,
      transcript: [...this.state.transcript, entry],
    };
    this.callbacks.transcript.forEach(callback => callback());
  }

  protected pushEvent(event: RealtimeModelV1ServerEvent): void {
    const nextEvents = [...this.state.events, event];
    this.state = {
      ...this.state,
      events:
        nextEvents.length > this.maxEvents
          ? nextEvents.slice(-this.maxEvents)
          : nextEvents,
    };
    this.callbacks.events.forEach(callback => callback());
  }
}

export type UseRealtimeReturn = {
  status: RealtimeStatus;
  transcript: TranscriptEntry[];
  events: RealtimeModelV1ServerEvent[];
  isCapturing: boolean;
  isPlaying: boolean;

  connect: () => Promise<void>;
  disconnect: () => void;
  sendEvent: RealtimeStore['sendEvent'];
  sendTextMessage: (text: string) => void;
  sendAudio: (base64Audio: string) => void;
  commitAudio: () => void;
  clearAudioBuffer: () => void;
  requestResponse: (options?: { modalities?: string[] }) => void;
  cancelResponse: () => void;
  startAudioCapture: (stream: MediaStream) => void;
  stopAudioCapture: () => void;
  stopPlayback: () => void;
};

export function useRealtime(options: UseRealtimeOptions): UseRealtimeReturn {
  const callbacksRef = useRef({
    onEvent: options.onEvent,
    onError: options.onError,
  });
  callbacksRef.current = {
    onEvent: options.onEvent,
    onError: options.onError,
  };

  const realtimeRef = useRef<RealtimeStore | null>(null);

  if (realtimeRef.current == null) {
    realtimeRef.current = new RealtimeStore({
      ...options,
      onEvent: (...args) => callbacksRef.current.onEvent?.(...args),
      onError: (...args) => callbacksRef.current.onError?.(...args),
    });
  }

  const rt = realtimeRef.current;

  const status = useSyncExternalStore(
    useCallback(cb => rt.subscribe('status', cb), [rt]),
    () => rt.status,
    () => rt.status,
  );

  const transcript = useSyncExternalStore(
    useCallback(cb => rt.subscribe('transcript', cb), [rt]),
    () => rt.transcript,
    () => rt.transcript,
  );

  const events = useSyncExternalStore(
    useCallback(cb => rt.subscribe('events', cb), [rt]),
    () => rt.events,
    () => rt.events,
  );

  const isCapturing = useSyncExternalStore(
    useCallback(cb => rt.subscribe('isCapturing', cb), [rt]),
    () => rt.isCapturing,
    () => rt.isCapturing,
  );

  const isPlaying = useSyncExternalStore(
    useCallback(cb => rt.subscribe('isPlaying', cb), [rt]),
    () => rt.isPlaying,
    () => rt.isPlaying,
  );

  useEffect(() => {
    return () => rt.dispose();
  }, [rt]);

  return {
    status,
    transcript,
    events,
    isCapturing,
    isPlaying,
    connect: rt.connect.bind(rt),
    disconnect: rt.disconnect.bind(rt),
    sendEvent: rt.sendEvent.bind(rt),
    sendTextMessage: rt.sendTextMessage.bind(rt),
    sendAudio: rt.sendAudio.bind(rt),
    commitAudio: rt.commitAudio.bind(rt),
    clearAudioBuffer: rt.clearAudioBuffer.bind(rt),
    requestResponse: rt.requestResponse.bind(rt),
    cancelResponse: rt.cancelResponse.bind(rt),
    startAudioCapture: rt.startAudioCapture.bind(rt),
    stopAudioCapture: rt.stopAudioCapture.bind(rt),
    stopPlayback: rt.stopPlayback.bind(rt),
  };
}
