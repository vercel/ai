import { delay } from '@ai-sdk/provider-utils';
import { JSONRPCMessage } from './json-rpc-message';
import { MCPTransport } from './mcp-transport';
import { MCPTool, Resource, ResourceTemplate } from './types';

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

const DEFAULT_RESOURCES: Resource[] = [
  {
    uri: 'file:///mock/document.txt',
    name: 'mock-document',
    description: 'A mock document for testing',
    mimeType: 'text/plain',
  },
];

const DEFAULT_RESOURCE_TEMPLATES: ResourceTemplate[] = [
  {
    uriTemplate: 'file:///mock/{filename}',
    name: 'mock-file-template',
    description: 'A mock file template for testing',
    mimeType: 'text/plain',
  },
];

export class MockMCPTransport implements MCPTransport {
  private tools;
  private resources;
  private resourceTemplates;
  private failOnInvalidToolParams;
  private initializeResult;
  private sendError;

  onmessage?: (message: JSONRPCMessage) => void;
  onclose?: () => void;
  onerror?: (error: Error) => void;

  constructor({
    overrideTools = DEFAULT_TOOLS,
    overrideResources = DEFAULT_RESOURCES,
    overrideResourceTemplates = DEFAULT_RESOURCE_TEMPLATES,
    failOnInvalidToolParams = false,
    initializeResult,
    sendError = false,
  }: {
    overrideTools?: MCPTool[];
    overrideResources?: Resource[];
    overrideResourceTemplates?: ResourceTemplate[];
    failOnInvalidToolParams?: boolean;
    initializeResult?: Record<string, unknown>;
    sendError?: boolean;
  } = {}) {
    this.tools = overrideTools;
    this.resources = overrideResources;
    this.resourceTemplates = overrideResourceTemplates;
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
              ...(this.resources.length > 0 || this.resourceTemplates.length > 0
                ? { resources: { subscribe: true } }
                : {}),
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

      if (message.method === 'resources/list') {
        await delay(10);
        if (this.resources.length === 0) {
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
            resources: this.resources,
          },
        });
      }

      if (message.method === 'resources/templates/list') {
        await delay(10);
        if (this.resourceTemplates.length === 0) {
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
            resourceTemplates: this.resourceTemplates,
          },
        });
      }

      if (message.method === 'resources/read') {
        await delay(10);
        const uri = message.params?.uri as string;

        if (!uri) {
          this.onmessage?.({
            jsonrpc: '2.0',
            id: message.id,
            error: {
              code: -32602,
              message: 'Invalid params: uri is required',
            },
          });
          return;
        }

        this.onmessage?.({
          jsonrpc: '2.0',
          id: message.id,
          result: {
            contents: [
              {
                uri,
                mimeType: 'text/plain',
                text: `Mock resource content for ${uri}`,
              },
            ],
          },
        });
      }

      if (message.method === 'resources/subscribe') {
        await delay(10);
        const uri = message.params?.uri as string;

        if (!uri) {
          this.onmessage?.({
            jsonrpc: '2.0',
            id: message.id,
            error: {
              code: -32602,
              message: 'Invalid params: uri is required',
            },
          });
          return;
        }

        // Acknowledge subscription
        this.onmessage?.({
          jsonrpc: '2.0',
          id: message.id,
          result: {},
        });

        // Simulate a resource update notification after a delay
        setTimeout(() => {
          this.onmessage?.({
            jsonrpc: '2.0',
            method: 'notifications/resources/updated',
            params: { uri },
          });
        }, 100);
      }

      if (message.method === 'resources/unsubscribe') {
        await delay(10);
        const uri = message.params?.uri as string;

        if (!uri) {
          this.onmessage?.({
            jsonrpc: '2.0',
            id: message.id,
            error: {
              code: -32602,
              message: 'Invalid params: uri is required',
            },
          });
          return;
        }

        // Acknowledge unsubscription
        this.onmessage?.({
          jsonrpc: '2.0',
          id: message.id,
          result: {},
        });
      }
    }
  }

  async close(): Promise<void> {
    this.onclose?.();
  }
}
