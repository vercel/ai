import {
  Experimental_AbstractRealtimeSession as AbstractRealtimeSession,
  type Experimental_RealtimeServerEvent as RealtimeServerEvent,
  type Experimental_RealtimeSessionOptions as RealtimeSessionOptions,
  type Experimental_RealtimeState as RealtimeState,
  type Experimental_RealtimeStatus as RealtimeStatus,
  type UIMessage,
} from 'ai';
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';

type UseRealtimeOptions = RealtimeSessionOptions;

type RealtimeStateKey = keyof RealtimeState;
type RealtimeStoreKey = {
  model: RealtimeSessionOptions['model'];
  token: string | undefined;
  websocket: string | undefined;
  protocols: string;
  startupTimeoutMs: RealtimeSessionOptions['startupTimeoutMs'];
  closeTimeoutMs: RealtimeSessionOptions['closeTimeoutMs'];
  sessionConfig: RealtimeSessionOptions['sessionConfig'];
  sampleRate: RealtimeSessionOptions['sampleRate'];
  maxEvents: RealtimeSessionOptions['maxEvents'];
  autoContinueTools: RealtimeSessionOptions['autoContinueTools'];
  maxPlaybackBufferSeconds: RealtimeSessionOptions['maxPlaybackBufferSeconds'];
};

function getRealtimeStoreKey(options: UseRealtimeOptions): RealtimeStoreKey {
  return {
    model: options.model,
    token: options.api.token,
    websocket: options.api.websocket,
    protocols: JSON.stringify(options.api.protocols ?? []),
    startupTimeoutMs: options.startupTimeoutMs,
    closeTimeoutMs: options.closeTimeoutMs,
    sessionConfig: options.sessionConfig,
    sampleRate: options.sampleRate,
    maxEvents: options.maxEvents,
    autoContinueTools: options.autoContinueTools,
    maxPlaybackBufferSeconds: options.maxPlaybackBufferSeconds,
  };
}

function shouldCreateRealtimeStore(
  currentKey: RealtimeStoreKey,
  nextOptions: UseRealtimeOptions,
): boolean {
  return (
    currentKey.model !== nextOptions.model ||
    currentKey.token !== nextOptions.api.token ||
    currentKey.websocket !== nextOptions.api.websocket ||
    currentKey.protocols !== JSON.stringify(nextOptions.api.protocols ?? []) ||
    currentKey.startupTimeoutMs !== nextOptions.startupTimeoutMs ||
    currentKey.closeTimeoutMs !== nextOptions.closeTimeoutMs ||
    currentKey.sessionConfig !== nextOptions.sessionConfig ||
    currentKey.sampleRate !== nextOptions.sampleRate ||
    currentKey.maxEvents !== nextOptions.maxEvents ||
    currentKey.autoContinueTools !== nextOptions.autoContinueTools ||
    currentKey.maxPlaybackBufferSeconds !== nextOptions.maxPlaybackBufferSeconds
  );
}

class RealtimeStore extends AbstractRealtimeSession {
  protected state: RealtimeState = {
    status: 'disconnected',
    messages: [],
    events: [],
    isCapturing: false,
    isPlaying: false,
  };

  private callbacks: { [K in RealtimeStateKey]-?: Set<() => void> } = {
    status: new Set(),
    messages: new Set(),
    events: new Set(),
    isCapturing: new Set(),
    isPlaying: new Set(),
    session: new Set(),
  };

  get status(): RealtimeStatus {
    return this.state.status;
  }

  get messages(): UIMessage[] {
    return this.state.messages;
  }

  get events(): RealtimeServerEvent[] {
    return this.state.events;
  }

  get isCapturing(): boolean {
    return this.state.isCapturing;
  }

  get isPlaying(): boolean {
    return this.state.isPlaying;
  }

  get session(): RealtimeState['session'] {
    return this.state.session;
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
}

type UseRealtimeReturn = {
  status: RealtimeStatus;
  messages: UIMessage[];
  events: RealtimeServerEvent[];
  isCapturing: boolean;
  isPlaying: boolean;
  session?: RealtimeState['session'];

  connect: RealtimeStore['connect'];
  close: RealtimeStore['close'];
  resumePlayback: () => Promise<void>;
  resumeAudioCapture: () => Promise<void>;
  disconnect: () => void;
  addToolOutput: (callId: string, result: unknown) => void;
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

function useRealtime(options: UseRealtimeOptions): UseRealtimeReturn {
  const callbacksRef = useRef({
    onToolCall: options.onToolCall,
    onEvent: options.onEvent,
    onError: options.onError,
  });
  callbacksRef.current = {
    onToolCall: options.onToolCall,
    onEvent: options.onEvent,
    onError: options.onError,
  };

  const realtimeRef = useRef<{
    store: RealtimeStore;
    key: RealtimeStoreKey;
  } | null>(null);

  let realtimeEntry = realtimeRef.current;

  if (
    realtimeEntry == null ||
    shouldCreateRealtimeStore(realtimeEntry.key, options)
  ) {
    realtimeEntry = {
      store: new RealtimeStore({
        ...options,
        onToolCall: (...args) => callbacksRef.current.onToolCall?.(...args),
        onEvent: (...args) => callbacksRef.current.onEvent?.(...args),
        onError: (...args) => callbacksRef.current.onError?.(...args),
      }),
      key: getRealtimeStoreKey(options),
    };
    realtimeRef.current = realtimeEntry;
  } else {
    realtimeEntry.key = getRealtimeStoreKey(options);
  }

  const rt = realtimeEntry.store;

  const status = useSyncExternalStore(
    useCallback(cb => rt.subscribe('status', cb), [rt]),
    () => rt.status,
    () => rt.status,
  );

  const messages = useSyncExternalStore(
    useCallback(cb => rt.subscribe('messages', cb), [rt]),
    () => rt.messages,
    () => rt.messages,
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

  const session = useSyncExternalStore(
    useCallback(cb => rt.subscribe('session', cb), [rt]),
    () => rt.session,
    () => rt.session,
  );

  useEffect(() => {
    return () => rt.dispose();
  }, [rt]);

  return {
    status,
    messages,
    events,
    isCapturing,
    isPlaying,
    session,
    close: rt.close.bind(rt),
    resumePlayback: rt.resumePlayback.bind(rt),
    resumeAudioCapture: rt.resumeAudioCapture.bind(rt),
    connect: rt.connect.bind(rt),
    disconnect: rt.disconnect.bind(rt),
    addToolOutput: rt.addToolOutput.bind(rt),
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

export const experimental_useRealtime = useRealtime;

export type {
  RealtimeStatus as Experimental_RealtimeStatus,
  UseRealtimeOptions as Experimental_UseRealtimeOptions,
  UseRealtimeReturn as Experimental_UseRealtimeReturn,
};
