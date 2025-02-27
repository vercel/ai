import { createMCPClient } from './mcp-client';
import { MockMCPTransport } from './mock-mcp-transport';
import { z } from 'zod';
import { CallToolResult } from './types';
import { MCPClientError } from '../../../errors';

const createMockTransport = vi.fn(config => new MockMCPTransport(config));

vi.mock('./mcp-transport.ts', () => {
  return {
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
      transport: { type: 'stdio', command: 'node', args: ['test.js'] },
    });
    const tools = await client.tools();
    expect(tools).toHaveProperty('mock-tool');

    const tool = tools['mock-tool'];
    expect(tool).toHaveProperty('parameters');
    expect(tool.parameters).toMatchObject({
      jsonSchema: {
        type: 'object',
        properties: {
          foo: { type: 'string' },
        },
      },
    });

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
    ).toEqual({
      content: [
        {
          type: 'text',
          text: 'Mock tool call result',
        },
      ],
    });
  });

  it('should return typed AI SDK compatible tool set', async () => {
    client = await createMCPClient({
      transport: { type: 'stdio', command: 'node', args: ['test.js'] },
    });
    const tools = await client.tools({
      schemas: {
        'mock-tool': {
          parameters: z.object({
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

  it('should not return user-defined tool if it is nonexistent', async () => {
    client = await createMCPClient({
      transport: { type: 'stdio', command: 'node', args: ['test.js'] },
    });
    const tools = await client.tools({
      schemas: {
        'nonexistent-tool': {
          parameters: z.object({ bar: z.string() }),
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
      transport: { type: 'stdio', command: 'node', args: ['test.js'] },
    });
    const tools = await client.tools({
      schemas: {
        'mock-tool': {
          parameters: z.object({ bar: z.string() }),
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
      transport: { type: 'stdio', command: 'node', args: ['test.js'] },
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
        transport: { type: 'stdio', command: 'node', args: ['test.js'] },
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
        transport: { type: 'stdio', command: 'node', args: ['test.js'] },
      }),
    ).rejects.toThrowError(MCPClientError);
  });

  it('should close transport when client is closed', async () => {
    const mockTransport = new MockMCPTransport();
    const closeSpy = vi.spyOn(mockTransport, 'close');
    createMockTransport.mockImplementation(() => mockTransport);
    const client = await createMCPClient({
      transport: { type: 'stdio', command: 'node', args: ['test.js'] },
    });
    await client.close();
    expect(closeSpy).toHaveBeenCalled();
  });

  it('should throw Abort Error if tool call request is aborted', async () => {
    client = await createMCPClient({
      transport: { type: 'stdio', command: 'node', args: ['test.js'] },
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
      transport: { type: 'stdio', command: 'node', args: ['test.js'] },
      onUncaughtError,
    });
    expect(onUncaughtError).toHaveBeenCalled();
  });
});
