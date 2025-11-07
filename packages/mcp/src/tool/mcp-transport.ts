import { MCPClientError } from '../error/mcp-client-error';
import { JSONRPCMessage } from './json-rpc-message';
import { SseMCPTransport } from './mcp-sse-transport';
import { HttpMCPTransport } from './mcp-http-transport';
import { OAuthClientProvider } from './oauth';

/**
 * Transport interface for MCP (Model Context Protocol) communication.
 * Maps to the `Transport` interface in the MCP spec.
 */
export interface MCPTransport {
  /**
   * Initialize and start the transport
   */
  start(): Promise<void>;

  /**
   * Send a JSON-RPC message through the transport
   * @param message The JSON-RPC message to send
   */
  send(message: JSONRPCMessage): Promise<void>;

  /**
   * Clean up and close the transport
   */
  close(): Promise<void>;

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
