import { z } from 'zod/v4';
import { MCPClientError } from '../../error/mcp-client-error';
import { createMCPClient } from './mcp-client';
import { MockMCPTransport } from './mock-mcp-transport';
import { CallToolResult } from './types';

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

    expectTypeOf<typeof result>().toEqualTypeOf<CallToolResult>();
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

    expectTypeOf<typeof result>().toEqualTypeOf<CallToolResult>();
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
});
