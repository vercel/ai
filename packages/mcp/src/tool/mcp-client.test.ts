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

>>>>>>> 937d731587 ([v6.0] fix: MCP callTool hangs and leaks its response handler when an in-flight request is aborted (#16794))
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

  it('should reject in-flight tool call request when aborted', async () => {
    const transport = new HangingToolCallTransport();
    client = await createMCPClient({ transport });

    const abortController = new AbortController();
    const abortReason = new Error('abort after send');
    const toolCallPromise = (
      client as unknown as {
        callTool: (args: {
          name: string;
          args: Record<string, unknown>;
          options?: { abortSignal?: AbortSignal };
        }) => Promise<unknown>;
      }
    ).callTool({
      name: 'hanging-tool',
      args: {},
      options: { abortSignal: abortController.signal },
    });

    expect(
      transport.sentMessages.some(
        message => 'method' in message && message.method === 'tools/call',
      ),
    ).toBe(true);

    abortController.abort(abortReason);

    await expect(toolCallPromise).rejects.toSatisfy(
      error =>
        MCPClientError.isInstance(error) &&
        error.message === 'Request was aborted' &&
        error.cause === abortReason,
    );
    expect(
      (
        client as unknown as {
          responseHandlers: Map<number, unknown>;
        }
      ).responseHandlers.size,
    ).toBe(0);
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
