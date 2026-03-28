import {
  RealtimeModelV1ClientSecretOptions,
  RealtimeModelV1ClientSecretResult,
} from './realtime-model-v1-client-secret';
import { RealtimeModelV1ClientEvent } from './realtime-model-v1-client-event';
import { RealtimeModelV1ServerEvent } from './realtime-model-v1-server-event';
import { RealtimeModelV1SessionConfig } from './realtime-model-v1-session-config';

/**
 * Specification for a realtime model that supports bidirectional
 * audio/text communication over WebSocket.
 *
 * Providers implement this interface to enable realtime voice
 * conversations through the AI SDK.
 */
export type RealtimeModelV1 = {
  /**
   * The realtime model must specify which interface version it implements.
   */
  readonly specificationVersion: 'v1';

  /**
   * Provider ID (e.g. 'openai', 'xai').
   */
  readonly provider: string;

  /**
   * Provider-specific model ID (e.g. 'gpt-4o-realtime', 'grok-3').
   */
  readonly modelId: string;

  /**
   * Server-side: Creates an ephemeral client secret for authenticating
   * browser-side WebSocket connections. The secret is short-lived and
   * safe to expose to client code.
   *
   * Naming: "do" prefix to prevent accidental direct usage by the user.
   */
  doCreateClientSecret(
    options: RealtimeModelV1ClientSecretOptions,
  ): PromiseLike<RealtimeModelV1ClientSecretResult>;

  /**
   * Browser-side: Returns the WebSocket URL and subprotocols to use
   * when connecting. Each provider has its own authentication mechanism
   * (e.g. OpenAI uses subprotocol headers, xAI may use query params).
   */
  getWebSocketConfig(options: { token: string; url: string }): {
    url: string;
    protocols?: string[];
  };

  /**
   * Browser-side: Parses a raw JSON event received over the WebSocket
   * and returns a normalized event. Providers map their native event
   * format to the common RealtimeModelV1ServerEvent union.
   */
  parseServerEvent(raw: unknown): RealtimeModelV1ServerEvent;

  /**
   * Browser-side: Serializes a normalized client event into the
   * provider's native JSON format for sending over the WebSocket.
   */
  serializeClientEvent(event: RealtimeModelV1ClientEvent): unknown;

  /**
   * Browser-side: Builds the provider-specific session configuration
   * payload from a normalized session config. Used to construct the
   * session.update event sent after WebSocket connection.
   */
  buildSessionConfig(config: RealtimeModelV1SessionConfig): unknown;
};
