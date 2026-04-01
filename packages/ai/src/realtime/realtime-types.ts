import { RealtimeToolDefinition } from '../types/realtime-model';

/**
 * Response shape for the realtime setup/token endpoint.
 * The client uses this to establish a WebSocket connection and
 * configure the session with tool definitions.
 */
export type RealtimeSetupResponse = {
  token: string;
  url: string;
  expiresAt?: number;
  tools: RealtimeToolDefinition[];

  /**
   * HMAC-signed token that authorizes the client to execute the tools
   * listed during setup. The client must send this back in every
   * `execute-tools` request so the server can verify it statelessly.
   *
   * Created with `createRealtimeToolToken()`.
   */
  toolToken?: string;
};

/**
 * Request body for the realtime tool execution endpoint.
 * Sent by the client when the model invokes a server-side tool.
 */
export type RealtimeToolsExecuteRequestBody = {
  /**
   * HMAC-signed token received from the setup endpoint.
   * The server verifies this with `verifyRealtimeToolToken()` before
   * executing any tools.
   */
  toolToken?: string;

  tools: Record<
    string,
    {
      name: string;
      inputs: unknown;
    }
  >;
};

/**
 * Response shape for the realtime tool execution endpoint.
 * Maps tool call IDs to their execution results.
 */
export type RealtimeToolsExecuteResponse = Record<string, unknown>;
