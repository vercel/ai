import { z } from 'zod/v4';
import { MCPClientError } from '../../error/mcp-client-error';
import { createMCPClient } from './mcp-client';
import { MockMCPTransport } from './mock-mcp-transport';
import { CallToolResult, Resource, ResourceTemplate } from './types';
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

vi.mock('./mcp-transport.ts', async importOriginal => {
  const actual = await importOriginal<typeof import('./mcp-transport')>();
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

  describe('Resources', () => {
    it('should list resources', async () => {
      client = await createMCPClient({
        transport: { type: 'sse', url: 'https://example.com/sse' },
      });
      const result = await client.listResources();
      expect(result.resources).toHaveLength(1);
      expect(result.resources[0]).toMatchObject({
        uri: 'file:///mock/document.txt',
        name: 'mock-document',
        description: 'A mock document for testing',
        mimeType: 'text/plain',
      });
    });

    it('should list resource templates', async () => {
      client = await createMCPClient({
        transport: { type: 'sse', url: 'https://example.com/sse' },
      });
      const result = await client.listResourceTemplates();
      expect(result.resourceTemplates).toHaveLength(1);
      expect(result.resourceTemplates[0]).toMatchObject({
        uriTemplate: 'file:///mock/{filename}',
        name: 'mock-file-template',
        description: 'A mock file template for testing',
        mimeType: 'text/plain',
      });
    });

    it('should read a resource with string uri', async () => {
      client = await createMCPClient({
        transport: { type: 'sse', url: 'https://example.com/sse' },
      });
      const result = await client.readResource('file:///mock/document.txt');
      expect(result).toHaveProperty('contents');
      expect(result.contents).toHaveLength(1);
      expect(result.contents[0]).toMatchObject({
        uri: 'file:///mock/document.txt',
        mimeType: 'text/plain',
        text: 'Mock resource content for file:///mock/document.txt',
      });
    });

    it('should read a resource with params object', async () => {
      client = await createMCPClient({
        transport: { type: 'sse', url: 'https://example.com/sse' },
      });
      const result = await client.readResource({ uri: 'file:///mock/document.txt' });
      expect(result).toHaveProperty('contents');
      expect(result.contents).toHaveLength(1);
      expect(result.contents[0]).toMatchObject({
        uri: 'file:///mock/document.txt',
        mimeType: 'text/plain',
        text: 'Mock resource content for file:///mock/document.txt',
      });
    });

    it('should include resources as tools when includeResources is true', async () => {
      client = await createMCPClient({
        transport: { type: 'sse', url: 'https://example.com/sse' },
      });
      const tools = await client.tools({ includeResources: true });

      // Should have both regular tools and resource tools
      expect(tools).toHaveProperty('mock-tool');
      expect(tools).toHaveProperty('resource_mock-document');
      expect(tools).toHaveProperty('resource_template_mock-file-template');

      // Test direct resource tool
      const resourceTool = tools['resource_mock-document'];
      expect(resourceTool).toHaveProperty('inputSchema');
      const result = await resourceTool.execute({}, { messages: [], toolCallId: '1' });
      expect(result).toHaveProperty('contents');
      expect(result.contents[0]).toMatchObject({
        uri: 'file:///mock/document.txt',
        text: 'Mock resource content for file:///mock/document.txt',
      });
    });

    it('should include resource templates as tools with parameters', async () => {
      client = await createMCPClient({
        transport: { type: 'sse', url: 'https://example.com/sse' },
      });
      const tools = await client.tools({ includeResources: true });

      const templateTool = tools['resource_template_mock-file-template'];
      expect(templateTool).toHaveProperty('inputSchema');
      expect(templateTool.inputSchema).toMatchObject({
        jsonSchema: {
          type: 'object',
          properties: {
            filename: {
              type: 'string',
              description: 'Value for filename in URI template',
            },
          },
          required: ['filename'],
          additionalProperties: false,
        },
      });

      const result = await templateTool.execute(
        { filename: 'test.txt' },
        { messages: [], toolCallId: '1' }
      );
      expect(result).toHaveProperty('contents');
      expect(result.contents[0]).toMatchObject({
        uri: 'file:///mock/test.txt',
        text: 'Mock resource content for file:///mock/test.txt',
      });
    });

    it('should not include resources when includeResources is false', async () => {
      client = await createMCPClient({
        transport: { type: 'sse', url: 'https://example.com/sse' },
      });
      const tools = await client.tools({ includeResources: false });

      expect(tools).toHaveProperty('mock-tool');
      expect(tools).not.toHaveProperty('resource_mock-document');
      expect(tools).not.toHaveProperty('resource_template_mock-file-template');
    });

    it('should throw error when server does not support resources', async () => {
      const mockTransport = new MockMCPTransport({
        overrideResources: [],
        overrideResourceTemplates: [],
      });
      client = await createMCPClient({
        transport: mockTransport,
      });

      await expect(client.listResources()).rejects.toThrow(MCPClientError);
    });
  });

  describe('Resource Subscriptions', () => {
    it('should subscribe to resource updates', async () => {
      client = await createMCPClient({
        transport: { type: 'sse', url: 'https://example.com/sse' },
      });

      // Subscribe should not throw
      await expect(
        client.subscribeResource('file:///mock/document.txt')
      ).resolves.not.toThrow();
    });

    it('should receive resource update notifications', async () => {
      client = await createMCPClient({
        transport: { type: 'sse', url: 'https://example.com/sse' },
      });

      const notifications: string[] = [];
      client.onResourceUpdated(({ uri }) => {
        notifications.push(uri);
      });

      await client.subscribeResource('file:///mock/document.txt');

      // Wait for the mock notification
      await new Promise(resolve => setTimeout(resolve, 150));

      expect(notifications).toContain('file:///mock/document.txt');
    });

    it('should handle multiple notification handlers', async () => {
      client = await createMCPClient({
        transport: { type: 'sse', url: 'https://example.com/sse' },
      });

      const notifications1: string[] = [];
      const notifications2: string[] = [];

      client.onResourceUpdated(({ uri }) => {
        notifications1.push(uri);
      });

      client.onResourceUpdated(({ uri }) => {
        notifications2.push(uri);
      });

      await client.subscribeResource('file:///mock/document.txt');

      // Wait for the mock notification
      await new Promise(resolve => setTimeout(resolve, 150));

      expect(notifications1).toContain('file:///mock/document.txt');
      expect(notifications2).toContain('file:///mock/document.txt');
    });

    it('should unsubscribe from resource updates', async () => {
      client = await createMCPClient({
        transport: { type: 'sse', url: 'https://example.com/sse' },
      });

      // Unsubscribe should not throw
      await expect(
        client.unsubscribeResource('file:///mock/document.txt')
      ).resolves.not.toThrow();
    });

    it('should throw error when server does not support subscriptions', async () => {
      const mockTransport = new MockMCPTransport({
        initializeResult: {
          protocolVersion: '2025-06-18',
          serverInfo: {
            name: 'mock-mcp-server',
            version: '1.0.0',
          },
          capabilities: {
            resources: {}, // No subscribe capability
          },
        },
      });

      client = await createMCPClient({
        transport: mockTransport,
      });

      await expect(
        client.subscribeResource('file:///mock/document.txt')
      ).rejects.toThrow('Server does not support resource subscriptions');
    });

    it('should support async notification handlers', async () => {
      client = await createMCPClient({
        transport: { type: 'sse', url: 'https://example.com/sse' },
      });

      const notifications: string[] = [];
      client.onResourceUpdated(async ({ uri }) => {
        // Simulate async processing
        await new Promise(resolve => setTimeout(resolve, 10));
        notifications.push(uri);
      });

      await client.subscribeResource('file:///mock/document.txt');

      // Wait for the mock notification and async processing
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(notifications).toContain('file:///mock/document.txt');
    });
  });
});
