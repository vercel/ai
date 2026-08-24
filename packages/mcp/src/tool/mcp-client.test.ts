import { z } from 'zod/v4';
import { MCPClientError } from '../error/mcp-client-error';
import { createMCPClient } from './mcp-client';
import { MockMCPTransport } from './mock-mcp-transport';
import {
  type CallToolResult,
  type ListResourceTemplatesResult,
  type ListResourcesResult,
  type ReadResourceResult,
  type ListPromptsResult,
  type GetPromptResult,
  type Configuration,
  ElicitationRequestSchema,
} from './types';
import type { JSONRPCRequest } from './json-rpc-message';
import {
  beforeEach,
  afterEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from 'vitest';

const createMockTransport = vi.fn(config => new MockMCPTransport(config));

<<<<<<< HEAD
=======
class GetterOnlyProtocolVersionTransport implements MCPTransport {
  private readonly transport: MockMCPTransport;
  private negotiatedProtocolVersion?: string;

  onmessage?: (message: JSONRPCMessage) => void;
  onclose?: () => void;
  onerror?: (error: Error) => void;

  constructor(protocolVersion: string) {
    this.transport = new MockMCPTransport({
      initializeResult: {
        protocolVersion,
        serverInfo: { name: 'mock-mcp-server', version: '1.0.0' },
        capabilities: { tools: {} },
      },
    });
  }

  get protocolVersion(): string | undefined {
    return this.negotiatedProtocolVersion;
  }

  setProtocolVersion(version: string): void {
    this.negotiatedProtocolVersion = version;
  }

  async start(): Promise<void> {
    await this.transport.start();
  }

  async send(message: JSONRPCMessage): Promise<void> {
    this.transport.onmessage = this.onmessage;
    this.transport.onclose = this.onclose;
    this.transport.onerror = this.onerror;
    await this.transport.send(message);
  }

  async close(): Promise<void> {
    await this.transport.close();
  }
}

class ProtocolDiscoveryTransport implements MCPTransport {
  readonly supportsProtocolVersionDiscovery = true;
  readonly sentMessages: JSONRPCMessage[] = [];
  protocolVersion?: string;

  onmessage?: (message: JSONRPCMessage) => void;
  onclose?: () => void;
  onerror?: (error: Error) => void;

  constructor(
    private readonly discoveryBehavior:
      | 'modern'
      | 'legacy'
      | 'unsupported' = 'modern',
    private readonly includeToolListResultType = true,
  ) {}

  async start(): Promise<void> {}

  async close(): Promise<void> {
    this.onclose?.();
  }

  setProtocolVersion(version: string): void {
    this.protocolVersion = version;
  }

  async send(message: JSONRPCMessage): Promise<void> {
    this.sentMessages.push(message);

    if (!('method' in message) || !('id' in message)) {
      return;
    }

    if (message.method === 'server/discover') {
      if (this.discoveryBehavior === 'legacy') {
        this.onmessage?.({
          jsonrpc: '2.0',
          id: message.id,
          error: { code: -32601, message: 'Method not found' },
        });
        return;
      }

      if (this.discoveryBehavior === 'unsupported') {
        this.onmessage?.({
          jsonrpc: '2.0',
          id: message.id,
          error: {
            code: -32022,
            message: 'Unsupported protocol version',
            data: {
              requested: LATEST_PROTOCOL_VERSION,
              supported: ['2099-01-01'],
            },
          },
        });
        return;
      }

      this.onmessage?.({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          resultType: 'complete',
          supportedVersions: [LATEST_PROTOCOL_VERSION],
          capabilities: { tools: {} },
          _meta: {
            'io.modelcontextprotocol/serverInfo': {
              name: 'modern-test-server',
              version: '1.0.0',
            },
          },
        },
      });
      return;
    }

    if (message.method === 'initialize') {
      this.onmessage?.({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          protocolVersion: LATEST_LEGACY_PROTOCOL_VERSION,
          serverInfo: { name: 'legacy-test-server', version: '1.0.0' },
          capabilities: { tools: {} },
        },
      });
      return;
    }

    if (message.method === 'tools/list') {
      this.onmessage?.({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          ...(this.includeToolListResultType ? { resultType: 'complete' } : {}),
          tools: [],
        },
      });
    }
  }
}

class PaginatedToolsTransport implements MCPTransport {
  readonly toolListCursors: Array<string | undefined> = [];

  onmessage?: (message: JSONRPCMessage) => void;
  onclose?: () => void;
  onerror?: (error: Error) => void;

  async start(): Promise<void> {}

  async close(): Promise<void> {
    this.onclose?.();
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (!('method' in message) || !('id' in message)) {
      return;
    }

    if (message.method === 'initialize') {
      this.onmessage?.({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          protocolVersion: LATEST_LEGACY_PROTOCOL_VERSION,
          serverInfo: { name: 'paginated-tools-server', version: '1.0.0' },
          capabilities: { tools: {} },
        },
      });
      return;
    }

    if (message.method === 'tools/list') {
      const cursor = message.params?.cursor as string | undefined;
      this.toolListCursors.push(cursor);
      this.onmessage?.({
        jsonrpc: '2.0',
        id: message.id,
        result:
          cursor == null
            ? {
                tools: [
                  {
                    name: 'first-page-tool',
                    inputSchema: { type: 'object' },
                  },
                ],
                nextCursor: 'second-page',
              }
            : {
                tools: [
                  {
                    name: 'second-page-tool',
                    inputSchema: { type: 'object' },
                  },
                ],
              },
      });
    }
  }
}

class FailsFirstToolCallTransport implements MCPTransport {
  toolCallAttempts = 0;

  onmessage?: (message: JSONRPCMessage) => void;
  onclose?: () => void;
  onerror?: (error: Error) => void;

  constructor(
    private readonly failure:
      | 'transient-http'
      | 'unlisted-http'
      | 'network'
      | 'invalid-params'
      | 'auth'
      | 'tool-result-error',
  ) {}

  async start(): Promise<void> {}

  async close(): Promise<void> {
    this.onclose?.();
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (!('method' in message) || !('id' in message)) {
      return;
    }

    if (message.method === 'initialize') {
      this.onmessage?.({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          protocolVersion: LATEST_PROTOCOL_VERSION,
          serverInfo: { name: 'retry-test-server', version: '1.0.0' },
          capabilities: { tools: {} },
        },
      });
      return;
    }

    if (message.method === 'tools/list') {
      this.onmessage?.({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          tools: [
            {
              name: 'retry-tool',
              description: 'A retry test tool',
              inputSchema: {
                type: 'object',
                properties: {
                  value: { type: 'string' },
                },
              },
            },
          ],
        },
      });
      return;
    }

    if (message.method === 'tools/call') {
      this.toolCallAttempts += 1;

      if (this.toolCallAttempts === 1) {
        if (this.failure === 'transient-http') {
          throw new MCPClientError({
            message: 'temporary overload',
            statusCode: 503,
          });
        }

        if (this.failure === 'unlisted-http') {
          throw new MCPClientError({
            message: 'not retryable by default',
            statusCode: 418,
          });
        }

        if (this.failure === 'network') {
          throw Object.assign(new Error('connection reset'), {
            code: 'ECONNRESET',
          });
        }

        if (this.failure === 'invalid-params') {
          this.onmessage?.({
            jsonrpc: '2.0',
            id: message.id,
            error: {
              code: -32602,
              message: 'Invalid params',
            },
          });
          return;
        }

        if (this.failure === 'auth') {
          throw new MCPClientError({
            message: 'Unauthorized',
            statusCode: 401,
          });
        }

        this.onmessage?.({
          jsonrpc: '2.0',
          id: message.id,
          result: {
            content: [{ type: 'text', text: 'tool-level error' }],
            isError: true,
          },
        });
        return;
      }

      this.onmessage?.({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          content: [{ type: 'text', text: 'retried successfully' }],
          isError: false,
        },
      });
    }
  }
}

class HangingToolCallTransport implements MCPTransport {
  sentMessages: JSONRPCMessage[] = [];

  onmessage?: (message: JSONRPCMessage) => void;
  onclose?: () => void;
  onerror?: (error: Error) => void;

  async start(): Promise<void> {}

  async close(): Promise<void> {
    this.onclose?.();
  }

  async send(message: JSONRPCMessage): Promise<void> {
    this.sentMessages.push(message);

    if (!('method' in message) || !('id' in message)) {
      return;
    }

    if (message.method === 'initialize') {
      this.onmessage?.({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          protocolVersion: LATEST_PROTOCOL_VERSION,
          serverInfo: { name: 'hanging-tool-call-server', version: '1.0.0' },
          capabilities: { tools: {} },
        },
      });
      return;
    }

    if (message.method === 'tools/call') {
      // Intentionally never respond. This exercises aborting an in-flight
      // request after it has been sent to a slow or hung MCP server.
      return;
    }
  }
}

class SignalAwareHangingRequestTransport implements MCPTransport {
  requestSignal?: AbortSignal;
  requestAborted = false;

  onmessage?: (message: JSONRPCMessage) => void;
  onclose?: () => void;
  onerror?: (error: Error) => void;

  async start(): Promise<void> {}

  async close(): Promise<void> {
    this.onclose?.();
  }

  async send(
    message: JSONRPCMessage,
    options?: { signal?: AbortSignal },
  ): Promise<void> {
    if (!('method' in message) || !('id' in message)) {
      return;
    }

    if (message.method === 'initialize') {
      this.onmessage?.({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          protocolVersion: LATEST_PROTOCOL_VERSION,
          serverInfo: { name: 'signal-aware-server', version: '1.0.0' },
          capabilities: { tools: {} },
        },
      });
      return;
    }

    if (message.method === 'tools/list') {
      this.requestSignal = options?.signal;
      await new Promise<void>((_, reject) => {
        options?.signal?.addEventListener(
          'abort',
          () => {
            this.requestAborted = true;
            reject(options.signal?.reason);
          },
          { once: true },
        );
      });
    }
  }
}

class HangingInitializationTransport implements MCPTransport {
  closeCalled = false;

  onmessage?: (message: JSONRPCMessage) => void;
  onclose?: () => void;
  onerror?: (error: Error) => void;

  async start(): Promise<void> {}

  async close(): Promise<void> {
    this.closeCalled = true;
    this.onclose?.();
  }

  async send(_message: JSONRPCMessage): Promise<void> {}
}

>>>>>>> 1175434706 (fix: return all tools from paginated MCP tool lists (#19246))
vi.mock('./mcp-transport.ts', async importOriginal => {
  const actual =
    // oxlint-disable-next-line typescript-eslint/consistent-type-imports
    await importOriginal<typeof import('./mcp-transport')>();
  return {
    ...actual,
    createMcpTransport: vi.fn(config => {
      return createMockTransport(config);
    }),
  };
});

describe('MCPClient', () => {
  let client: Awaited<ReturnType<typeof createMCPClient>>;

  beforeEach(async () => {
    createMockTransport.mockClear();
    createMockTransport.mockImplementation(() => new MockMCPTransport());
  });

  afterEach(async () => {
    await client?.close();
  });

  it('should return AI SDK compatible tool set', async () => {
    client = await createMCPClient({
      transport: { type: 'sse', url: 'https://example.com/sse' },
    });
    const tools = await client.tools();
    expect(tools).toHaveProperty('mock-tool');

    const tool = tools['mock-tool'];
    expect(tool).toHaveProperty('inputSchema');
    expect(tool.inputSchema).toMatchObject({
      jsonSchema: {
        type: 'object',
        properties: {
          foo: { type: 'string' },
        },
      },
    });
    expect(tool).toHaveProperty('type');
    expect(tool.type).toBe('dynamic');

    const toolCall = tool.execute;
    expect(toolCall).toBeDefined();
    expect(
      await toolCall(
        { foo: 'bar' },
        {
          messages: [],
          toolCallId: '1',
        },
      ),
    ).toMatchInlineSnapshot(`
      {
        "content": [
          {
            "text": "Mock tool call result",
            "type": "text",
          },
        ],
        "isError": false,
      }
    `);
  });

<<<<<<< HEAD
=======
  it('should return tools from all paginated tool list responses', async () => {
    const transport = new PaginatedToolsTransport();
    client = await createMCPClient({ transport });

    const tools = await client.tools();

    expect(Object.keys(tools)).toEqual(['first-page-tool', 'second-page-tool']);
    expect(transport.toolListCursors).toEqual([undefined, 'second-page']);
  });

  it('should expose MCP tool metadata on dynamic tools', async () => {
    client = await createMCPClient({
      transport: { type: 'sse', url: 'https://example.com/sse' },
      clientName: 'MyMCPClient',
    });

    const tools = await client.tools();

    expect(tools['mock-tool'].metadata).toEqual({
      clientName: 'MyMCPClient',
      toolName: 'mock-tool',
    });
  });

  it('should expose MCP Apps metadata on tools', async () => {
    createMockTransport.mockImplementation(
      () =>
        new MockMCPTransport({
          overrideTools: [
            {
              name: 'showDashboard',
              description: 'Show dashboard',
              inputSchema: {
                type: 'object',
                properties: {
                  topic: { type: 'string' },
                },
              },
              _meta: {
                ui: {
                  resourceUri: 'ui://ai-sdk-e2e/dashboard',
                  visibility: ['model', 'app'],
                },
              },
            },
          ],
        }),
    );

    client = await createMCPClient({
      transport: { type: 'sse', url: 'https://example.com/sse' },
      clientName: 'MyMCPClient',
    });

    const dynamicTools = await client.tools();
    const typedTools = await client.tools({
      schemas: {
        showDashboard: {
          inputSchema: z.object({
            topic: z.string(),
          }),
        },
      },
    });

    expect(dynamicTools.showDashboard.metadata).toMatchInlineSnapshot(`
      {
        "app": {
          "mimeType": "text/html;profile=mcp-app",
          "resourceUri": "ui://ai-sdk-e2e/dashboard",
          "visibility": [
            "model",
            "app",
          ],
        },
        "clientName": "MyMCPClient",
        "toolName": "showDashboard",
      }
    `);
    expect(typedTools.showDashboard.metadata).toEqual(
      dynamicTools.showDashboard.metadata,
    );
  });

  it('should support deprecated client name for MCP tool metadata', async () => {
    client = await createMCPClient({
      transport: { type: 'sse', url: 'https://example.com/sse' },
      name: 'DeprecatedMCPServer',
    });

    const tools = await client.tools();

    expect(tools['mock-tool'].metadata).toEqual({
      clientName: 'DeprecatedMCPServer',
      toolName: 'mock-tool',
    });
  });

  it('should return serializable tool definitions via listTools()', async () => {
    client = await createMCPClient({
      transport: { type: 'sse', url: 'https://example.com/sse' },
    });
    const definitions = await client.listTools();

    expect(definitions).toHaveProperty('tools');
    expect(definitions.tools).toHaveLength(2);
    expect(definitions.tools[0]).toMatchObject({
      name: 'mock-tool',
      description: 'A mock tool for testing',
      inputSchema: {
        type: 'object',
        properties: {
          foo: { type: 'string' },
        },
      },
    });

    // Verify definitions are serializable (no functions)
    const serialized = JSON.stringify(definitions);
    const parsed = JSON.parse(serialized);
    expect(parsed.tools[0].name).toBe('mock-tool');
  });

  it('should create tools from cached definitions via toolsFromDefinitions()', async () => {
    client = await createMCPClient({
      transport: { type: 'sse', url: 'https://example.com/sse' },
    });

    // Get definitions (this would normally be cached)
    const definitions = await client.listTools();

    // Create tools from definitions without refetching
    const tools = client.toolsFromDefinitions(definitions);

    expect(tools).toHaveProperty('mock-tool');
    const tool = tools['mock-tool'];
    expect(tool).toHaveProperty('inputSchema');
    expect(tool).toHaveProperty('execute');

    // Verify the execute function works
    const result = await tool.execute(
      { foo: 'bar' },
      { messages: [], toolCallId: '1', context: {} },
    );
    expect(result).toMatchObject({
      content: [{ type: 'text', text: 'Mock tool call result' }],
    });
  });

  it('should allow caching workflow with listTools() and toolsFromDefinitions()', async () => {
    client = await createMCPClient({
      transport: { type: 'sse', url: 'https://example.com/sse' },
    });

    // Simulate caching workflow
    const definitions = await client.listTools();
    const cachedJson = JSON.stringify(definitions);

    // Later: restore from cache and create tools
    const restored = JSON.parse(cachedJson);
    const tools = client.toolsFromDefinitions(restored);

    expect(tools).toHaveProperty('mock-tool');
    expect(tools['mock-tool'].execute).toBeDefined();
  });

  it('should convert MCP image content to AI SDK format via toModelOutput', async () => {
    createMockTransport.mockImplementation(
      () =>
        new MockMCPTransport({
          overrideTools: [
            {
              name: 'get-image',
              description: 'Returns an image',
              inputSchema: { type: 'object' },
            },
          ],
          toolCallResults: {
            'get-image': {
              content: [
                {
                  type: 'image',
                  data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
                  mimeType: 'image/png',
                },
              ],
              isError: false,
            },
          },
        }),
    );

    client = await createMCPClient({
      transport: { type: 'sse', url: 'https://example.com/sse' },
    });

    const tools = await client.tools();
    const tool = tools['get-image'];

    expect(
      await tool.execute!({}, { messages: [], toolCallId: '1', context: {} }),
    ).toMatchInlineSnapshot(`
      {
        "content": [
          {
            "data": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==",
            "mimeType": "image/png",
            "type": "image",
          },
        ],
        "isError": false,
      }
    `);

    expect(tool.toModelOutput).toBeDefined();
    expect(
      tool.toModelOutput!({
        toolCallId: '1',
        input: {},
        output: {
          content: [
            {
              type: 'image',
              data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
              mimeType: 'image/png',
            },
          ],
          isError: false,
        },
      }),
    ).toMatchInlineSnapshot(`
      {
        "type": "content",
        "value": [
          {
            "data": {
              "data": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==",
              "type": "data",
            },
            "mediaType": "image/png",
            "type": "file",
          },
        ],
      }
    `);
  });

  it('should convert MCP text content to AI SDK format via toModelOutput', async () => {
    createMockTransport.mockImplementation(
      () =>
        new MockMCPTransport({
          overrideTools: [
            {
              name: 'get-text',
              description: 'Returns text',
              inputSchema: { type: 'object' },
            },
          ],
          toolCallResults: {
            'get-text': {
              content: [
                {
                  type: 'text',
                  text: 'Hello world',
                },
              ],
              isError: false,
            },
          },
        }),
    );

    client = await createMCPClient({
      transport: { type: 'sse', url: 'https://example.com/sse' },
    });

    const tools = await client.tools();
    const tool = tools['get-text'];

    expect(
      await tool.execute!({}, { messages: [], toolCallId: '1', context: {} }),
    ).toMatchInlineSnapshot(`
      {
        "content": [
          {
            "text": "Hello world",
            "type": "text",
          },
        ],
        "isError": false,
      }
    `);

    expect(tool.toModelOutput).toBeDefined();
    expect(
      tool.toModelOutput!({
        toolCallId: '1',
        input: {},
        output: {
          content: [{ type: 'text', text: 'Hello world' }],
          isError: false,
        },
      }),
    ).toMatchInlineSnapshot(`
      {
        "type": "content",
        "value": [
          {
            "text": "Hello world",
            "type": "text",
          },
        ],
      }
    `);
  });

  it('should convert mixed MCP content to AI SDK format via toModelOutput', async () => {
    createMockTransport.mockImplementation(
      () =>
        new MockMCPTransport({
          overrideTools: [
            {
              name: 'get-mixed',
              description: 'Returns mixed content',
              inputSchema: { type: 'object' },
            },
          ],
          toolCallResults: {
            'get-mixed': {
              content: [
                { type: 'text', text: 'Here is an image:' },
                { type: 'image', data: 'base64data', mimeType: 'image/png' },
              ],
              isError: false,
            },
          },
        }),
    );

    client = await createMCPClient({
      transport: { type: 'sse', url: 'https://example.com/sse' },
    });

    const tools = await client.tools();
    const tool = tools['get-mixed'];

    expect(
      await tool.execute!({}, { messages: [], toolCallId: '1', context: {} }),
    ).toMatchInlineSnapshot(`
        {
          "content": [
            {
              "text": "Here is an image:",
              "type": "text",
            },
            {
              "data": "base64data",
              "mimeType": "image/png",
              "type": "image",
            },
          ],
          "isError": false,
          "toolResult": undefined,
        }
      `);

    expect(tool.toModelOutput).toBeDefined();
    expect(
      tool.toModelOutput!({
        toolCallId: '1',
        input: {},
        output: {
          content: [
            { type: 'text', text: 'Here is an image:' },
            { type: 'image', data: 'base64data', mimeType: 'image/png' },
          ],
          isError: false,
        },
      }),
    ).toMatchInlineSnapshot(`
      {
        "type": "content",
        "value": [
          {
            "text": "Here is an image:",
            "type": "text",
          },
          {
            "data": {
              "data": "base64data",
              "type": "data",
            },
            "mediaType": "image/png",
            "type": "file",
          },
        ],
      }
    `);
  });

  it('should fallback to JSON for unknown content types via toModelOutput', async () => {
    createMockTransport.mockImplementation(
      () =>
        new MockMCPTransport({
          overrideTools: [
            {
              name: 'get-unknown',
              description: 'Returns unknown content',
              inputSchema: { type: 'object' },
            },
          ],
          toolCallResults: {
            'get-unknown': {
              content: [{ type: 'custom', data: { foo: 'bar' } }],
              isError: false,
            } as unknown as CallToolResult,
          },
        }),
    );

    client = await createMCPClient({
      transport: { type: 'sse', url: 'https://example.com/sse' },
    });

    const tools = await client.tools();
    const tool = tools['get-unknown'];

    expect(
      await tool.execute!({}, { messages: [], toolCallId: '1', context: {} }),
    ).toMatchInlineSnapshot(`
        {
          "content": [
            {
              "data": {
                "foo": "bar",
              },
              "type": "custom",
            },
          ],
          "isError": false,
          "toolResult": undefined,
        }
      `);

    expect(tool.toModelOutput).toBeDefined();
    expect(
      (tool.toModelOutput as Function)({
        toolCallId: '1',
        input: {},
        output: {
          content: [{ type: 'custom', data: { foo: 'bar' } }],
          isError: false,
        },
      }),
    ).toMatchInlineSnapshot(`
      {
        "type": "content",
        "value": [
          {
            "text": "{"type":"custom","data":{"foo":"bar"}}",
            "type": "text",
          },
        ],
      }
    `);
  });

  it('should fallback to JSON when result has no content array via toModelOutput', async () => {
    createMockTransport.mockImplementation(
      () =>
        new MockMCPTransport({
          overrideTools: [
            {
              name: 'get-raw',
              description: 'Returns raw result',
              inputSchema: { type: 'object' },
            },
          ],
          toolCallResults: {
            'get-raw': {
              value: 42,
              isError: false,
            } as unknown as CallToolResult,
          },
        }),
    );

    client = await createMCPClient({
      transport: { type: 'sse', url: 'https://example.com/sse' },
    });

    const tools = await client.tools();
    const tool = tools['get-raw'];

    expect(
      await tool.execute!({}, { messages: [], toolCallId: '1', context: {} }),
    ).toMatchInlineSnapshot(`
        {
          "isError": false,
          "toolResult": undefined,
          "value": 42,
        }
      `);

    expect(tool.toModelOutput).toBeDefined();
    expect(
      (tool.toModelOutput as Function)({
        toolCallId: '1',
        input: {},
        output: { value: 42, isError: false },
      }),
    ).toMatchInlineSnapshot(`
      {
        "type": "json",
        "value": {
          "isError": false,
          "value": 42,
        },
      }
    `);
  });

  it('should expose _meta field from MCP tool definition', async () => {
    createMockTransport.mockImplementation(
      () =>
        new MockMCPTransport({
          overrideTools: [
            {
              name: 'tool-with-meta',
              description: 'A tool with metadata',
              inputSchema: {
                type: 'object',
                properties: {
                  input: { type: 'string' },
                },
              },
              _meta: {
                'openai/outputTemplate': '{{result}}',
              },
            },
          ],
        }),
    );

    client = await createMCPClient({
      transport: { type: 'sse', url: 'https://example.com/sse' },
    });

    const tools = await client.tools();
    const tool = tools['tool-with-meta'];

    expect(tool._meta?.['openai/outputTemplate']).toBe('{{result}}');
  });

>>>>>>> 1175434706 (fix: return all tools from paginated MCP tool lists (#19246))
  it('should list resources from the server', async () => {
    client = await createMCPClient({
      transport: { type: 'sse', url: 'https://example.com/sse' },
    });

    const resources = await client.listResources();

    expectTypeOf(resources).toEqualTypeOf<ListResourcesResult>();

    expect(resources.resources).toMatchInlineSnapshot(`
      [
        {
          "description": "Mock resource",
          "mimeType": "text/plain",
          "name": "resource.txt",
          "uri": "file:///mock/resource.txt",
        },
      ]
    `);
  });

  it('should read resource contents', async () => {
    client = await createMCPClient({
      transport: { type: 'sse', url: 'https://example.com/sse' },
    });

    const result = await client.readResource({
      uri: 'file:///mock/resource.txt',
    });

    expectTypeOf(result).toEqualTypeOf<ReadResourceResult>();

    expect(result.contents).toMatchInlineSnapshot(`
      [
        {
          "mimeType": "text/plain",
          "text": "Mock resource content",
          "uri": "file:///mock/resource.txt",
        },
      ]
    `);
  });

  it('should list resource templates', async () => {
    client = await createMCPClient({
      transport: { type: 'sse', url: 'https://example.com/sse' },
    });

    const templates = await client.listResourceTemplates();

    expectTypeOf(templates).toEqualTypeOf<ListResourceTemplatesResult>();

    expect(templates.resourceTemplates).toMatchInlineSnapshot(`
      [
        {
          "description": "Mock template",
          "name": "mock-template",
          "uriTemplate": "file:///{path}",
        },
      ]
    `);
  });

  it('should list prompts from the server', async () => {
    client = await createMCPClient({
      transport: { type: 'sse', url: 'https://example.com/sse' },
    });

    const prompts = await client.listPrompts();

    expectTypeOf(prompts).toEqualTypeOf<ListPromptsResult>();

    expect(prompts.prompts).toMatchInlineSnapshot(`
      [
        {
          "arguments": [
            {
              "description": "The code to review",
              "name": "code",
              "required": true,
            },
          ],
          "description": "Asks the LLM to analyze code quality and suggest improvements",
          "name": "code_review",
          "title": "Request Code Review",
        },
      ]
    `);
  });

  it('should get a prompt by name', async () => {
    client = await createMCPClient({
      transport: { type: 'sse', url: 'https://example.com/sse' },
    });

    const prompt = await client.getPrompt({
      name: 'code_review',
      arguments: { code: 'print(42)' },
    });

    expectTypeOf(prompt).toEqualTypeOf<GetPromptResult>();

    expect(prompt).toMatchInlineSnapshot(`
      {
        "description": "Code review prompt",
        "messages": [
          {
            "content": {
              "text": "Please review this code:
      function add(a, b) { return a + b; }",
              "type": "text",
            },
            "role": "user",
          },
        ],
      }
    `);
  });

  it('should throw if the server does not support prompts', async () => {
    createMockTransport.mockImplementation(
      () =>
        new MockMCPTransport({
          resources: [],
          prompts: [],
        }),
    );

    client = await createMCPClient({
      transport: { type: 'sse', url: 'https://example.com/sse' },
    });

    await expect(client.listPrompts()).rejects.toThrow(MCPClientError);
    await expect(client.getPrompt({ name: 'code_review' })).rejects.toThrow(
      MCPClientError,
    );
  });

  it('should return typed AI SDK compatible tool set when schemas are provided', async () => {
    const mockTransport = new MockMCPTransport({
      overrideTools: [
        {
          name: 'mock-tool-only-input-schema',
          description: 'A mock tool for testing custom transports',
          inputSchema: {
            type: 'object',
            properties: {
              foo: { type: 'string' },
            },
          },
        },
      ],
    });

    client = await createMCPClient({
      transport: mockTransport,
    });

    const tools = await client.tools({
      schemas: {
        'mock-tool-only-input-schema': {
          inputSchema: z.object({
            foo: z.string(),
          }),
        },
      },
    });
    expect(tools).toHaveProperty('mock-tool-only-input-schema');
    const tool = tools['mock-tool-only-input-schema'];

    type ToolParams = Parameters<typeof tool.execute>[0];
    expectTypeOf<ToolParams>().toEqualTypeOf<{ foo: string }>();

    const result = await tool.execute(
      { foo: 'bar' },
      {
        messages: [],
        toolCallId: '1',
      },
    );

    expectTypeOf<
      Exclude<typeof result, AsyncIterable<any>>
    >().toEqualTypeOf<CallToolResult>();
  });

  it('should not return user-defined tool if it is nonexistent', async () => {
    client = await createMCPClient({
      transport: { type: 'sse', url: 'https://example.com/sse' },
    });
    const tools = await client.tools({
      schemas: {
        'nonexistent-tool': {
          inputSchema: z.object({ bar: z.string() }),
        },
      },
    });

    expect(tools).not.toHaveProperty('nonexistent-tool');
  });

  it('should not return server tools named after Object.prototype properties unless explicitly allowed', async () => {
    const mockTransport = new MockMCPTransport({
      overrideTools: [
        {
          name: 'allowed-tool',
          description: 'An explicitly allowed tool',
          inputSchema: {
            type: 'object',
            properties: { foo: { type: 'string' } },
          },
        },
        {
          name: 'constructor',
          description: 'Tool named after an inherited prototype property',
          inputSchema: { type: 'object' },
        },
        {
          name: 'toString',
          description: 'Tool named after an inherited prototype property',
          inputSchema: { type: 'object' },
        },
        {
          name: '__proto__',
          description: 'Tool named after an inherited prototype property',
          inputSchema: { type: 'object' },
        },
      ],
    });

    client = await createMCPClient({
      transport: mockTransport,
    });

    const tools = await client.tools({
      schemas: {
        'allowed-tool': {
          inputSchema: z.object({ foo: z.string() }),
        },
      },
    });

    expect(Object.keys(tools)).toEqual(['allowed-tool']);
    expect(Object.prototype.hasOwnProperty.call(tools, 'constructor')).toBe(
      false,
    );
    expect(Object.prototype.hasOwnProperty.call(tools, 'toString')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(tools, '__proto__')).toBe(
      false,
    );
  });

  it('should error when calling tool with misconfigured parameters', async () => {
    createMockTransport.mockImplementation(
      () =>
        new MockMCPTransport({
          failOnInvalidToolParams: true,
        }),
    );
    client = await createMCPClient({
      transport: { type: 'sse', url: 'https://example.com/sse' },
    });
    const tools = await client.tools({
      schemas: {
        'mock-tool': {
          inputSchema: z.object({ bar: z.string() }),
        },
      },
    });
    const toolCall = tools['mock-tool'].execute;
    await expect(
      toolCall({ bar: 'bar' }, { messages: [], toolCallId: '1' }),
    ).rejects.toThrow(MCPClientError);
  });

  it('should include JSON-RPC error data in MCPClientError', async () => {
    createMockTransport.mockImplementation(
      () =>
        new MockMCPTransport({
          failOnInvalidToolParams: true,
        }),
    );
    client = await createMCPClient({
      transport: { type: 'sse', url: 'https://example.com/sse' },
    });
    const tools = await client.tools({
      schemas: {
        'mock-tool': {
          inputSchema: z.object({ bar: z.string() }),
        },
      },
    });
    const toolCall = tools['mock-tool'].execute;

    try {
      await toolCall({ bar: 'bar' }, { messages: [], toolCallId: '1' });
      throw new Error('Expected error to be thrown');
    } catch (error) {
      expect(MCPClientError.isInstance(error)).toBe(true);
      if (MCPClientError.isInstance(error)) {
        expect(error.code).toBe(-32602);
        expect(error.data).toMatchInlineSnapshot(`
          {
            "expectedSchema": {
              "properties": {
                "foo": {
                  "type": "string",
                },
              },
              "type": "object",
            },
            "receivedArguments": {
              "bar": "bar",
            },
          }
        `);
      }
    }
  });

  it('should throw if the server does not support any tools', async () => {
    createMockTransport.mockImplementation(
      () =>
        new MockMCPTransport({
          overrideTools: [],
          resources: [],
        }),
    );

    client = await createMCPClient({
      transport: { type: 'sse', url: 'https://example.com/sse' },
    });

    await expect(client.tools()).rejects.toThrow(MCPClientError);
  });

  it('should throw if server sends invalid initialize result', async () => {
    createMockTransport.mockImplementation(
      () =>
        new MockMCPTransport({
          initializeResult: {},
        }),
    );

    await expect(
      createMCPClient({
        transport: { type: 'sse', url: 'https://example.com/sse' },
      }),
    ).rejects.toThrowError(MCPClientError);
  });

  it('should throw if server sends invalid protocol version', async () => {
    createMockTransport.mockImplementation(
      () =>
        new MockMCPTransport({
          initializeResult: {
            protocolVersion: 'foo',
            serverInfo: {
              name: 'mock-mcp-server',
              version: '1.0.0',
            },
            capabilities: {},
          },
        }),
    );

    await expect(
      createMCPClient({
        transport: { type: 'sse', url: 'https://example.com/sse' },
      }),
    ).rejects.toThrowError(MCPClientError);
  });

  it('should close transport when client is closed', async () => {
    const mockTransport = new MockMCPTransport();
    const closeSpy = vi.spyOn(mockTransport, 'close');
    createMockTransport.mockImplementation(() => mockTransport);
    const client = await createMCPClient({
      transport: { type: 'sse', url: 'https://example.com/sse' },
    });
    await client.close();
    expect(closeSpy).toHaveBeenCalled();
  });

  it('should throw Abort Error if tool call request is aborted', async () => {
    client = await createMCPClient({
      transport: { type: 'sse', url: 'https://example.com/sse' },
    });
    const tools = await client.tools();
    const tool = tools['mock-tool'];
    const abortController = new AbortController();
    abortController.abort();
    await expect(
      tool.execute(
        { foo: 'bar' },
        {
          messages: [],
          toolCallId: '1',
          abortSignal: abortController.signal,
        },
      ),
    ).rejects.toSatisfy(
      error => error instanceof Error && error.name === 'AbortError',
    );
  });

  describe('elicitation support', () => {
    it('should handle elicitation requests from the server', async () => {
      client = await createMCPClient({
        transport: { type: 'sse', url: 'https://example.com/sse' },
        capabilities: {
          elicitation: {},
        },
      });

      const transportInstance = createMockTransport.mock.results.at(-1)
        ?.value as MockMCPTransport;
      const sendSpy = vi.spyOn(transportInstance, 'send');
      const handler = vi.fn(async () => ({
        action: 'accept' as const,
        content: {
          name: 'octocat',
        },
      }));

      client.onElicitationRequest(ElicitationRequestSchema, handler);

      const elicitationRequest = {
        jsonrpc: '2.0' as const,
        id: 42,
        method: 'elicitation/create' as const,
        params: {
          message: 'Please provide your GitHub username',
          requestedSchema: {
            type: 'object',
            properties: {
              name: { type: 'string' },
            },
            required: ['name'],
          },
        },
      };

      transportInstance.onmessage?.(elicitationRequest);

      await Promise.resolve();
      await Promise.resolve();

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          params: {
            message: elicitationRequest.params.message,
            requestedSchema: elicitationRequest.params.requestedSchema,
          },
        }),
      );

      const elicitationResponse = sendSpy.mock.calls.find(
        ([message]) =>
          'result' in message && message.id === elicitationRequest.id,
      );

      expect(elicitationResponse?.[0]).toMatchObject({
        jsonrpc: '2.0',
        id: elicitationRequest.id,
        result: {
          action: 'accept',
          content: {
            name: 'octocat',
          },
        },
      });
    });
  });

  it('should use onUncaughtError callback if provided', async () => {
    const onUncaughtError = vi.fn();
    const mockTransport = new MockMCPTransport({
      sendError: true,
    });
    createMockTransport.mockImplementation(() => mockTransport);
    client = await createMCPClient({
      transport: { type: 'sse', url: 'https://example.com/sse' },
      onUncaughtError,
    });
    expect(onUncaughtError).toHaveBeenCalled();
  });

  it('should support custom transports', async () => {
    const mockTransport = new MockMCPTransport();
    client = await createMCPClient({
      transport: mockTransport,
    });
    const tools = await client.tools({
      schemas: {
        'mock-tool': {
          inputSchema: z.object({
            foo: z.string(),
          }),
        },
      },
    });
    expect(tools).toHaveProperty('mock-tool');
    const tool = tools['mock-tool'];

    type ToolParams = Parameters<typeof tool.execute>[0];
    expectTypeOf<ToolParams>().toEqualTypeOf<{ foo: string }>();

    const result = await tool.execute(
      { foo: 'bar' },
      {
        messages: [],
        toolCallId: '1',
      },
    );

    expectTypeOf<
      Exclude<typeof result, AsyncIterable<any>>
    >().toEqualTypeOf<CallToolResult>();
  });

  it('should throw if transport is missing required methods', async () => {
    // Because isCustomMcpTransport will return false, the client will fallback to createMcpTransport, but it will throw because the transport is invalid:
    const invalidTransport = {
      start: vi.fn(),
      close: vi.fn(),
    };
    // @ts-expect-error - invalid transport
    createMockTransport.mockImplementation(() => invalidTransport);
    await expect(
      // @ts-expect-error - invalid transport
      createMCPClient({ transport: invalidTransport }),
    ).rejects.toThrow();
  });

  it('should support zero-argument tools', async () => {
    client = await createMCPClient({
      transport: { type: 'sse', url: 'https://example.com/sse' },
    });
    const tools = await client.tools();
    const tool = tools['mock-tool-no-args'];
    expect(tool).toHaveProperty('inputSchema');
    expect(tool.inputSchema).toMatchObject({
      jsonSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    });

    const result = await tool.execute({}, { messages: [], toolCallId: '1' });
    expect(result).toMatchInlineSnapshot(`
      {
        "content": [
          {
            "text": "Mock tool call result",
            "type": "text",
          },
        ],
        "isError": false,
      }
    `);
  });

  it('should use custom client version when provided', async () => {
    const mockTransport = new MockMCPTransport();
    let capturedClientInfo: { name: string; version: string } | undefined;

    const originalSend = mockTransport.send.bind(mockTransport);
    mockTransport.send = vi.fn(async (message: JSONRPCRequest) => {
      if (message.method === 'initialize' && message.params) {
        capturedClientInfo = message.params.clientInfo as Configuration;
      }
      return originalSend(message);
    });

    client = await createMCPClient({
      transport: mockTransport,
      version: '2.5.0',
    });

    expect(capturedClientInfo).toBeDefined();
    expect(capturedClientInfo?.version).toBe('2.5.0');
  });

  it('should use default version when not provided', async () => {
    const mockTransport = new MockMCPTransport();
    let capturedClientInfo: { name: string; version: string } | undefined;

    const originalSend = mockTransport.send.bind(mockTransport);
    mockTransport.send = vi.fn(async (message: JSONRPCRequest) => {
      if (message.method === 'initialize' && message.params) {
        capturedClientInfo = message.params.clientInfo as Configuration;
      }
      return originalSend(message);
    });

    client = await createMCPClient({
      transport: mockTransport,
    });

    expect(capturedClientInfo).toBeDefined();
    expect(capturedClientInfo?.version).toBe('1.0.0');
  });
});
