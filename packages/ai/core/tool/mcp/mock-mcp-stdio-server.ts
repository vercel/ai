import { JSONRPCMessage, MCPTool } from './types';

const DEFAULT_TOOLS: MCPTool[] = [
  {
    name: 'mock-tool',
    description: 'A mock tool for testing',
    inputSchema: {
      type: 'object',
      properties: {
        foo: { type: 'string' },
      },
    },
  },
];

export class MockStdioTransport {
  private tools;

  onmessage?: (message: JSONRPCMessage) => void;
  onclose?: () => void;
  onerror?: (error: Error) => void;

  constructor({
    overrideTools = DEFAULT_TOOLS,
  }: {
    overrideTools?: MCPTool[];
  } = {}) {
    this.tools = overrideTools;
  }

  async start(): Promise<void> {
    return Promise.resolve();
  }

  async send(message: JSONRPCMessage): Promise<void> {
    // Mock server response implementation - extend as necessary:
    if ('method' in message && 'id' in message) {
      if (message.method === 'initialize') {
        setTimeout(() => {
          this.onmessage?.({
            jsonrpc: '2.0',
            id: message.id,
            result: {
              protocolVersion: '2024-11-05',
              serverInfo: {
                name: 'mock-mcp-server',
                version: '1.0.0',
              },
              capabilities: {
                ...(this.tools.length > 0 ? { tools: {} } : {}),
              },
            },
          });
        }, 0);
      }

      if (message.method === 'tools/list') {
        setTimeout(() => {
          this.onmessage?.({
            jsonrpc: '2.0',
            id: message.id,
            result: {
              tools: DEFAULT_TOOLS,
            },
          });
        }, 0);
      }

      if (message.method === 'tools/call') {
        setTimeout(() => {
          this.onmessage?.({
            jsonrpc: '2.0',
            id: message.id,
            result: {
              content: [
                {
                  type: 'text',
                  text: `Mock tool call result`,
                },
              ],
            },
          });
        }, 0);
      }
    }

    return Promise.resolve();
  }

  async close(): Promise<void> {
    if (this.onclose) this.onclose();
    return Promise.resolve();
  }
}
