import { secureJsonParse } from '@ai-sdk/provider-utils';
import {
  Experimental_AbstractRealtimeSession as AbstractRealtimeSession,
  type Experimental_RealtimeServerEvent as RealtimeServerEvent,
  type Experimental_RealtimeSessionOptions as RealtimeSessionOptions,
  type Experimental_RealtimeState as RealtimeState,
  type Experimental_RealtimeStatus as RealtimeStatus,
  type UIMessage,
} from 'ai';
import {
  useCallback,
  useEffect,
  useInsertionEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react';

type UseRealtimeOptions = RealtimeSessionOptions;

type RealtimeStateKey = keyof RealtimeState;

type RealtimeStore = AbstractRealtimeSession &
  RealtimeState & {
    subscribe(key: RealtimeStateKey, onChange: () => void): () => void;
  };

const useIsomorphicLayoutEffect =
  typeof window === 'undefined' ? useEffect : useLayoutEffect;

const RealtimeStore: new (options: RealtimeSessionOptions) => RealtimeStore =
  /* @__PURE__ */ (() => {
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

    return RealtimeStore;
  })();

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
  const ownerRef = useRef<{
    store: RealtimeStore;
    onToolCall: UseRealtimeOptions['onToolCall'];
    onEvent: UseRealtimeOptions['onEvent'];
    onError: UseRealtimeOptions['onError'];
  } | null>(null);
  const {
    model,
    api,
    startupTimeoutMs,
    closeTimeoutMs,
    rtcDisconnectTimeoutMs,
    sessionConfig,
    sampleRate,
    maxEvents,
    maxPlaybackBufferSeconds,
    onToolCall,
    onEvent,
    onError,
  } = options;
  const { token, websocket, session: sessionEndpoint } = api;
  const protocols = JSON.stringify(api.protocols ?? []);

  // Candidates allocate no transports or media; only a committed owner can act.
  const rt = useMemo(() => {
    const store: RealtimeStore = new RealtimeStore({
      model,
      api:
        token != null
          ? { token }
          : sessionEndpoint != null
            ? { session: sessionEndpoint }
            : {
                websocket: websocket as string,
                protocols: secureJsonParse(protocols) as string[],
              },
      startupTimeoutMs,
      closeTimeoutMs,
      rtcDisconnectTimeoutMs,
      sessionConfig,
      sampleRate,
      maxEvents,
      maxPlaybackBufferSeconds,
      onEvent: (...args) =>
        ownerRef.current?.store === store
          ? ownerRef.current.onEvent?.(...args)
          : undefined,
      onError: (...args) =>
        ownerRef.current?.store === store
          ? ownerRef.current.onError?.(...args)
          : undefined,
    });
    return store;
  }, [
    model,
    token,
    sessionEndpoint,
    websocket,
    protocols,
    startupTimeoutMs,
    closeTimeoutMs,
    rtcDisconnectTimeoutMs,
    sessionConfig,
    sampleRate,
    maxEvents,
    maxPlaybackBufferSeconds,
  ]);

  // Publish before child layout effects; insertion cleanup only revokes refs.
  useInsertionEffect(() => {
    ownerRef.current = { store: rt, onToolCall, onEvent, onError };
    rt.onToolCall =
      onToolCall == null
        ? undefined
        : (...args) =>
            ownerRef.current?.store === rt
              ? ownerRef.current.onToolCall?.(...args)
              : undefined;
    return () => {
      ownerRef.current = null;
    };
  });

  // StrictMode replays layout effects, but keeps the insertion-phase owner.
  useIsomorphicLayoutEffect(() => {
    return () => rt.dispose();
  }, [rt]);

  const actions = useMemo(() => {
    const current = () => {
      if (ownerRef.current == null)
        throw new Error('Realtime controls require a mounted hook');
      return ownerRef.current.store;
    };
    return {
      connect: async (options?: {
        stream?: MediaStream;
        capture?: boolean;
      }) => {
        const store = current();
        return options == null ? store.connect() : store.connect(options);
      },
      close: async options => current().close(options),
      resumePlayback: async () => current().resumePlayback(),
      resumeAudioCapture: async () => current().resumeAudioCapture(),
      disconnect: () => current().disconnect(),
      addToolOutput: (callId, result) =>
        current().addToolOutput(callId, result),
      sendEvent: event => current().sendEvent(event),
      sendTextMessage: text => current().sendTextMessage(text),
      sendAudio: audio => current().sendAudio(audio),
      commitAudio: () => current().commitAudio(),
      clearAudioBuffer: () => current().clearAudioBuffer(),
      requestResponse: options => current().requestResponse(options),
      cancelResponse: () => current().cancelResponse(),
      startAudioCapture: stream => current().startAudioCapture(stream),
      stopAudioCapture: () => current().stopAudioCapture(),
      stopPlayback: () => current().stopPlayback(),
    } satisfies Omit<UseRealtimeReturn, keyof RealtimeState>;
  }, []);

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

  return {
    status,
    messages,
    events,
    isCapturing,
    isPlaying,
    session,
    ...actions,
  };
}

export const experimental_useRealtime = useRealtime;

export type {
  RealtimeStatus as Experimental_RealtimeStatus,
  UseRealtimeOptions as Experimental_UseRealtimeOptions,
  UseRealtimeReturn as Experimental_UseRealtimeReturn,
};
