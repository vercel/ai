import { removeUndefinedEntries } from './remove-undefined-entries';
import {
  getWebSocketConstructor,
  readWebSocketMessageText,
  type WebSocketConstructor,
  type WebSocketLike,
} from './websocket';

export interface WebSocketConnection {
  /** Undefined when the constructor threw or the signal was already aborted. */
  socket: WebSocketLike | undefined;
  /**
   * Unregisters the abort listener and closes the socket. Never throws.
   * Handlers stay attached; callers guard their own terminal state.
   */
  close: (code?: number) => void;
}

/**
 * Opens a WebSocket for a provider model, owning the transport-generic layer
 * (analogous to `postToApi` for HTTP): constructor resolution, header hygiene,
 * abort wiring, and message decoding. Callers own the URL, the auth channel
 * (subprotocols vs headers), and the wire protocol.
 */
export function connectToWebSocket({
  url,
  protocols,
  headers,
  webSocket,
  abortSignal,
  onOpen,
  onMessageText,
  onProcessingError,
  onSocketError,
  onClose,
  onAbort,
}: {
  url: string | URL;
  protocols?: string | string[];
  headers?: Record<string, string | undefined>;
  webSocket?: WebSocketConstructor;
  abortSignal?: AbortSignal;
  onOpen?: (socket: WebSocketLike) => void;
  /** One decoded message. Throws and rejections go to `onProcessingError`. */
  onMessageText: (text: string) => void | PromiseLike<void>;
  /** Constructor throws and message decoding/processing failures. */
  onProcessingError: (error: unknown) => void;
  onSocketError?: () => void;
  /**
   * Receives the close code and reason when the transport provides them
   * (native `CloseEvent` / `ws` close event).
   */
  onClose?: (info: { code?: number; reason?: string }) => void;
  /** Also called (without opening a socket) when the signal is already aborted. */
  onAbort?: (reason: unknown) => void;
}): WebSocketConnection {
  let socket: WebSocketLike | undefined;
  let abortListener: (() => void) | undefined;

  const close = (code?: number) => {
    if (abortListener != null) {
      abortSignal?.removeEventListener('abort', abortListener);
      abortListener = undefined;
    }
    try {
      socket?.close(code);
    } catch {
      // socket may already be closed
    }
  };

  if (abortSignal?.aborted) {
    onAbort?.(abortSignal.reason ?? new Error('Aborted'));
    return { socket: undefined, close };
  }

  try {
    const WebSocketConstructor = getWebSocketConstructor(webSocket);
    // native `WebSocket` ignores the headers option; header-capable
    // implementations like `ws` forward it and throw on undefined values:
    socket = new WebSocketConstructor(url, protocols, {
      headers: removeUndefinedEntries(headers ?? {}),
    });
  } catch (error) {
    onProcessingError(error);
    return { socket: undefined, close };
  }

  if (abortSignal != null && onAbort != null) {
    abortListener = () => onAbort(abortSignal.reason ?? new Error('Aborted'));
    abortSignal.addEventListener('abort', abortListener, { once: true });
  }

  const openedSocket = socket;
  socket.onopen = () => {
    try {
      onOpen?.(openedSocket);
    } catch (error) {
      onProcessingError(error);
    }
  };
  // Messages are processed through a promise tail so async decoding (e.g.
  // Blob frames) cannot reorder them, and error/close handling cannot
  // overtake a still-decoding terminal frame.
  let tail: Promise<void> = Promise.resolve();
  socket.onmessage = event => {
    tail = tail
      .then(() => readWebSocketMessageText(event.data))
      .then(text => onMessageText(text))
      .catch(onProcessingError);
  };
  socket.onerror = () => {
    tail = tail.then(() => onSocketError?.()).catch(onProcessingError);
  };
  socket.onclose = event => {
    // Extract close diagnostics when the transport provides them (native
    // `CloseEvent` and `ws` both carry `code` and `reason`).
    const closeEvent = event as
      | { code?: unknown; reason?: unknown }
      | null
      | undefined;
    const code =
      typeof closeEvent?.code === 'number' ? closeEvent.code : undefined;
    const reason =
      typeof closeEvent?.reason === 'string' ? closeEvent.reason : undefined;
    tail = tail
      .then(() => onClose?.({ code, reason }))
      .catch(onProcessingError);
  };

  return { socket, close };
}
