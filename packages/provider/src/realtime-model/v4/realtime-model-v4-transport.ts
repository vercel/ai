import type { RealtimeModelV4ClientEvent } from './realtime-model-v4-client-event';
import type { RealtimeModelV4ServerEvent } from './realtime-model-v4-server-event';
import type { RealtimeModelV4SessionConfig } from './realtime-model-v4-session-config';

type RealtimeModelV4MediaStream = typeof globalThis extends {
  MediaStream: { prototype: infer T };
}
  ? T
  : never;

/** Callbacks for a provider-owned browser transport. */
export type RealtimeModelV4TransportOptions = {
  onEvent: (event: RealtimeModelV4ServerEvent) => void | Promise<void>;
  onError: (error: Error) => void;
  onFatalError: (error: Error, drain?: Promise<void>) => void;
  onClose: (error?: Error) => void;
  onCapturing: (value: boolean) => void;
  onPlaying: (value: boolean) => void;
};

/**
 * Browser transport for providers whose media protocol requires its own client.
 * Construction must not acquire media or open a connection. Provider-specific
 * dependencies and session setup/cleanup belong to the implementation.
 */
export type RealtimeModelV4Transport = {
  connect(options: {
    /** Application endpoint for creating and closing provider sessions. */
    api: string;
    sessionConfig?: RealtimeModelV4SessionConfig;
    /** Caller-owned tracks must never be stopped by the transport. */
    stream?: RealtimeModelV4MediaStream;
    capture?: boolean;
    abortSignal: AbortSignal;
  }): Promise<void>;
  sendEvent(
    event: RealtimeModelV4ClientEvent,
    shouldSend?: () => boolean,
  ): Promise<void>;
  startCapture(stream?: RealtimeModelV4MediaStream): Promise<void>;
  stopCapture(): Promise<void>;
  stopPlayback(): void;
  resumePlayback(): Promise<void>;
  /** Drain already accepted incoming events. */
  finish(): Promise<void>;
  /** Release local media and await remote session cleanup. Must be idempotent. */
  close(): Promise<void>;
  /** Release local resources immediately and initiate remote cleanup. */
  dispose(): void;
};
