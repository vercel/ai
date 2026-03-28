/**
 * Options for creating an ephemeral client secret for browser-side
 * WebSocket connections to a realtime model.
 */
export type RealtimeModelV4ClientSecretOptions = {
  /**
   * Number of seconds until the client secret expires.
   */
  expiresAfterSeconds?: number;

  /**
   * Optional session configuration to include in the token request.
   * Some providers (e.g. Google) require session config at token creation time.
   */
  sessionConfig?: Record<string, unknown>;
};

/**
 * Result of creating an ephemeral client secret.
 */
export type RealtimeModelV4ClientSecretResult = {
  /**
   * The ephemeral token value. Used as a Bearer token or in the
   * WebSocket subprotocol header for authentication.
   */
  token: string;

  /**
   * The WebSocket URL to connect to. Includes any provider-specific
   * query parameters (e.g. model ID).
   */
  url: string;

  /**
   * Unix timestamp (seconds) when this client secret expires.
   */
  expiresAt?: number;
};
