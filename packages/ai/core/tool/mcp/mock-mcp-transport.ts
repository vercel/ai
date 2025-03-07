import { delay } from '@ai-sdk/provider-utils';
import {
  InitializeResult,
  JSONRPCMessage,
  MCPTool,
  MCPTransport,
} from './types';

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

export class MockMCPTransport implements MCPTransport {
  private tools;
  private failOnInvalidToolParams;
  private initializeResult;
  private sendError;

  onMessage?: (message: JSONRPCMessage) => void;
  onClose?: () => void;
  onError?: (error: Error) => void;

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
      this.onError?.({
        name: 'UnknownError',
        message: 'Unknown error',
      });
    }
  }

  async send(message: JSONRPCMessage): Promise<void> {
    // Mock server response implementation - extend as necessary:
    if ('method' in message && 'id' in message) {
      if (message.method === 'initialize') {
        await delay(100);
        this.onMessage?.({
          jsonrpc: '2.0',
          id: message.id,
          result: this.initializeResult || {
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
      }

      if (message.method === 'tools/list') {
        await delay(100);
        this.onMessage?.({
          jsonrpc: '2.0',
          id: message.id,
          result: {
            tools: this.tools,
          },
        });
      }

      if (message.method === 'tools/call') {
        await delay(100);
        const toolName = message.params?.name;
        const tool = this.tools.find(t => t.name === toolName);

        if (!tool) {
          this.onMessage?.({
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
          this.onMessage?.({
            jsonrpc: '2.0',
            id: message.id,
            error: {
              code: -32602,
              message: `Invalid tool parameters: ${JSON.stringify(
                message.params?.arguments,
              )}`,
            },
          });
          return;
        }

        this.onMessage?.({
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
    this.onClose?.();
  }
}
