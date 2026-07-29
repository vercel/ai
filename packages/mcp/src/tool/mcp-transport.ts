import type { FetchFunction } from '@ai-sdk/provider-utils';
import { MCPClientError } from '../error/mcp-client-error';
import type { JSONRPCMessage } from './json-rpc-message';
import { SseMCPTransport } from './mcp-sse-transport';
import { HttpMCPTransport } from './mcp-http-transport';
import type { OAuthClientProvider } from './oauth';

/**
 * Transport interface for MCP (Model Context Protocol) communication.
 * Maps to the `Transport` interface in the MCP spec.
 */
export type MCPTransportSendOptions = {
  /**
   * Cancels the transport operation for this message.
   */
  signal?: AbortSignal;

  /**
   * Associates an outgoing message with an incoming request.
   */
  relatedRequestId?: string | number;

  /**
   * Resumes a previously interrupted request.
   */
  resumptionToken?: string;

  /**
   * Receives updated resumption tokens from transports that support them.
   */
  onresumptiontoken?: (token: string) => void;
};

export type MCPTransportCloseOptions = {
  /**
   * Cancels transport cleanup.
   */
  signal?: AbortSignal;
};

export interface MCPTransport {
  /**
   * Initialize and start the transport
   */
  start(): Promise<void>;

  /**
   * Send a JSON-RPC message through the transport
   * @param message The JSON-RPC message to send
   * @param options Optional request-scoped cancellation options
   */
  send(
    message: JSONRPCMessage,
    options?: MCPTransportSendOptions,
  ): Promise<void>;

  /**
   * Clean up and close the transport
   * @param options Optional cancellation options for transport cleanup
   */
  close(options?: MCPTransportCloseOptions): Promise<void>;

  /**
   * Event handler for transport closure
   */
  onclose?: () => void;

  /**
   * Event handler for transport errors
   */
  onerror?: (error: Error) => void;

  /**
   * Event handler for received messages
   */
  onmessage?: (message: JSONRPCMessage) => void;

  /**
   * The protocol version negotiated during initialization.
   */
  protocolVersion?: string;

  /**
   * Set the protocol version negotiated during initialization.
   */
  setProtocolVersion?(version: string): void;
}

export type MCPTransportConfig = {
  type: 'sse' | 'http';

  /**
   * The URL of the MCP server.
   */
  url: string;

  /**
   * Additional HTTP headers to be sent with requests.
   */
  headers?: Record<string, string>;

  /**
   * An optional OAuth client provider to use for authentication for MCP servers.
   */
  authProvider?: OAuthClientProvider;

  /**
   * Controls how HTTP redirects are handled for transport requests.
   * - `'follow'`: Follow redirects automatically (standard fetch behavior).
   * - `'error'`: Reject any redirect response with an error.
   * @default 'follow'
   */
  redirect?: 'follow' | 'error';

  /**
   * Optional custom fetch implementation to use for HTTP requests.
   * Useful for runtimes that need a request-local fetch.
   * @default globalThis.fetch
   */
  fetch?: FetchFunction;
};

export function createMcpTransport(config: MCPTransportConfig): MCPTransport {
  switch (config.type) {
    case 'sse':
      return new SseMCPTransport(config);
    case 'http':
      return new HttpMCPTransport(config);
    default:
      throw new MCPClientError({
        message:
          'Unsupported or invalid transport configuration. If you are using a custom transport, make sure it implements the MCPTransport interface.',
      });
  }
}

export function isCustomMcpTransport(
  transport: MCPTransportConfig | MCPTransport,
): transport is MCPTransport {
  return (
    'start' in transport &&
    typeof transport.start === 'function' &&
    'send' in transport &&
    typeof transport.send === 'function' &&
    'close' in transport &&
    typeof transport.close === 'function'
  );
}
