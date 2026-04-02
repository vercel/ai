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
};

/**
 * Request body for the realtime tool execution endpoint.
 * Sent by the client when the model invokes a server-side tool.
 */
export type RealtimeToolsExecuteRequestBody = {
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
