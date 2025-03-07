import { MCPTransport, TransportConfig } from './types';
import { StdioClientTransport } from './mcp-stdio-transport';
import { SSEClientTransport } from './mcp-sse-transport';

export function createMcpTransport(config: TransportConfig): MCPTransport {
  return config.type === 'stdio'
    ? new StdioClientTransport(config)
    : new SSEClientTransport(config);
}
