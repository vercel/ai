import { MCPClientError } from '../../../errors';
import { SSEClientTransport } from './mcp-sse-transport';
import { MCPTransport, TransportConfig } from './types';

export function createMcpTransport(config: TransportConfig): MCPTransport {
  if (config.type === 'stdio') {
    throw new MCPClientError({
      message:
        'The stdio transport configuration has been deprecated in favor of passing in a custom transport.',
    });
  }

  return new SSEClientTransport(config);
}
