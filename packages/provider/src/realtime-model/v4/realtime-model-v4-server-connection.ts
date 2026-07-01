/**
 * The realtime endpoint variant to open.
 *
 * Most providers expose a single conversational ("conversation") voice
 * endpoint; some additionally expose dedicated transcription / translation
 * endpoints that live at a different URL. `intent` selects which one a
 * server-side connection should target. Providers should fail fast when an
 * intent is not supported by their endpoint and codec.
 */
export type RealtimeModelV4SessionIntent =
  | 'conversation'
  | 'transcription'
  | 'translation';

/**
 * Descriptor for a server-initiated upstream WebSocket connection: the URL to
 * dial plus the headers (and optional subprotocols) to send on the handshake.
 *
 * Unlike `getWebSocketConfig` — which is browser-side and authenticates with a
 * short-lived token carried in a subprotocol — this carries the long-lived
 * provider credential in `headers` and is intended for a trusted server or
 * proxy that owns the socket itself.
 */
export type RealtimeModelV4ServerConnection = {
  /**
   * The `wss://` (or `ws://`) URL to connect to, including any provider-specific
   * query parameters (e.g. model id, transcription intent).
   */
  url: string;

  /**
   * Headers to send on the WebSocket handshake, including provider
   * authentication (e.g. `Authorization: Bearer <key>`).
   */
  headers: Record<string, string>;

  /**
   * Optional WebSocket subprotocols to negotiate on the handshake.
   */
  protocols?: string[];
};
