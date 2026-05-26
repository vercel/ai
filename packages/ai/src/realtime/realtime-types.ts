import type { Experimental_RealtimeToolDefinition } from '../types/realtime-model';

/**
 * Response shape for the realtime setup/token endpoint.
 * The client uses this to establish a WebSocket connection and
 * configure the session with tool definitions.
 */
export type Experimental_RealtimeSetupResponse = {
  token: string;
  url: string;
  expiresAt?: number;
  tools: Experimental_RealtimeToolDefinition[];
};
