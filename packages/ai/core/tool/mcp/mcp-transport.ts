import { MCPClientError } from '../../../errors';
import { JSONRPCMessage } from './json-rpc-message';
import { SseMCPTransport } from './mcp-sse-transport';

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
  type: 'sse';

  /**
   * The URL of the MCP server.
   */
  url: string;

  /**
   * Additional HTTP headers to be sent with requests.
   */
  headers?: Record<string, string>;
};

export function createMcpTransport(config: MCPTransportConfig): MCPTransport {
  if (config.type !== 'sse') {
    throw new MCPClientError({
      message:
        'Unsupported or invalid transport configuration. If you are using a custom transport, make sure it implements the MCPTransport interface.',
    });
  }

  return new SseMCPTransport(config);
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
