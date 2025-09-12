import { delay } from '@ai-sdk/provider-utils';
import { JSONRPCMessage } from './json-rpc-message';
import { MCPTransport } from './mcp-transport';
import { MCPTool } from './types';

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
  {
    name: 'mock-tool-no-args',
    description: 'A mock tool for testing',
    inputSchema: {
      type: 'object',
    },
  },
];

export class MockMCPTransport implements MCPTransport {
  private tools;
  private failOnInvalidToolParams;
  private initializeResult;
  private sendError;

  onmessage?: (message: JSONRPCMessage) => void;
  onclose?: () => void;
  onerror?: (error: Error) => void;

  constructor({
    overrideTools = DEFAULT_TOOLS,
    failOnInvalidToolParams = false,
    initializeResult,
    sendError = false,
  }: {
    overrideTools?: MCPTool[];
    failOnInvalidToolParams?: boolean;
    initializeResult?: Record<string, unknown>;
    sendError?: boolean;
  } = {}) {
    this.tools = overrideTools;
    this.failOnInvalidToolParams = failOnInvalidToolParams;
    this.initializeResult = initializeResult;
    this.sendError = sendError;
  }

  async start(): Promise<void> {
    if (this.sendError) {
      this.onerror?.({
        name: 'UnknownError',
        message: 'Unknown error',
      });
    }
  }

  async send(message: JSONRPCMessage): Promise<void> {
    // Mock server response implementation - extend as necessary:
    if ('method' in message && 'id' in message) {
      if (message.method === 'initialize') {
        await delay(10);
        this.onmessage?.({
          jsonrpc: '2.0',
          id: message.id,
          result: this.initializeResult || {
            protocolVersion: '2025-06-18',
            serverInfo: {
              name: 'mock-mcp-server',
              version: '1.0.0',
            },
            capabilities: {
              ...(this.tools.length > 0 ? { tools: {} } : {}),
            },
          },
        });
      }

      if (message.method === 'tools/list') {
        await delay(10);
        if (this.tools.length === 0) {
          this.onmessage?.({
            jsonrpc: '2.0',
            id: message.id,
            error: {
              code: -32000,
              message: 'Method not supported',
            },
          });
          return;
        }
        this.onmessage?.({
          jsonrpc: '2.0',
          id: message.id,
          result: {
            tools: this.tools,
          },
        });
      }

      if (message.method === 'tools/call') {
        await delay(10);
        const toolName = message.params?.name;
        const tool = this.tools.find(t => t.name === toolName);

        if (!tool) {
          this.onmessage?.({
            jsonrpc: '2.0',
            id: message.id,
            error: {
              code: -32601,
              message: `Tool ${toolName} not found`,
            },
          });
          return;
        }

        if (this.failOnInvalidToolParams) {
          this.onmessage?.({
            jsonrpc: '2.0',
            id: message.id,
            error: {
              code: -32602,
              message: `Invalid tool inputSchema: ${JSON.stringify(
                message.params?.arguments,
              )}`,
            },
          });
          return;
        }

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
      }
    }
  }

  async close(): Promise<void> {
    this.onclose?.();
  }
}
