import { delay } from '@ai-sdk/provider-utils';
import { JSONRPCMessage } from './json-rpc-message';
import { MCPTransport } from './mcp-transport';
import { MCPTool, MCPResource } from './types';

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
  private resources;
  private resourceTemplates;
  private resourceContents;
  private failOnInvalidToolParams;
  private initializeResult;
  private sendError;

  onmessage?: (message: JSONRPCMessage) => void;
  onclose?: () => void;
  onerror?: (error: Error) => void;

  constructor({
    overrideTools = DEFAULT_TOOLS,
    resources = [
      {
        uri: 'file:///mock/resource.txt',
        name: 'resource.txt',
        description: 'Mock resource',
        mimeType: 'text/plain',
      } satisfies MCPResource,
    ],
    resourceTemplates = [
      {
        uriTemplate: 'file:///{path}',
        name: 'mock-template',
        description: 'Mock template',
      },
    ],
    resourceContents = [
      {
        uri: 'file:///mock/resource.txt',
        text: 'Mock resource content',
        mimeType: 'text/plain',
      },
    ],
    failOnInvalidToolParams = false,
    initializeResult,
    sendError = false,
  }: {
    overrideTools?: MCPTool[];
    resources?: MCPResource[];
    resourceTemplates?: Array<
      Pick<MCPResource, 'name' | 'description' | 'mimeType'> & {
        uriTemplate: string;
        title?: string;
      }
    >;
    resourceContents?: Array<
      {
        uri: string;
        name?: string;
        title?: string;
        mimeType?: string;
      } & ({ text: string } | { blob: string })
    >;
    failOnInvalidToolParams?: boolean;
    initializeResult?: Record<string, unknown>;
    sendError?: boolean;
  } = {}) {
    this.tools = overrideTools;
    this.resources = resources;
    this.resourceTemplates = resourceTemplates;
    this.resourceContents = resourceContents;
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
              ...(this.resources.length > 0 ? { resources: {} } : {}),
            },
          },
        });
      }

      if (message.method === 'resources/list') {
        await delay(10);
        this.onmessage?.({
          jsonrpc: '2.0',
          id: message.id,
          result: {
            resources: this.resources,
          },
        });
      }

      if (message.method === 'resources/read') {
        await delay(10);
        const uri = message.params?.uri;
        const contents = this.resourceContents.filter(
          content => content.uri === uri,
        );

        if (contents.length === 0) {
          this.onmessage?.({
            jsonrpc: '2.0',
            id: message.id,
            error: {
              code: -32002,
              message: `Resource ${uri} not found`,
            },
          });
          return;
        }

        this.onmessage?.({
          jsonrpc: '2.0',
          id: message.id,
          result: {
            contents,
          },
        });
      }

      if (message.method === 'resources/templates/list') {
        await delay(10);
        this.onmessage?.({
          jsonrpc: '2.0',
          id: message.id,
          result: {
            resourceTemplates: this.resourceTemplates,
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
              data: {
                availableTools: this.tools.map(t => t.name),
                requestedTool: toolName,
              },
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
              data: {
                expectedSchema: tool.inputSchema,
                receivedArguments: message.params?.arguments,
              },
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
