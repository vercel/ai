import { JSONRPCMessage } from './types';

const DEFAULT_TOOLS = [
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
  onmessage?: (message: JSONRPCMessage) => void;
  onclose?: () => void;
  onerror?: (error: Error) => void;

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
                tools: {},
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
