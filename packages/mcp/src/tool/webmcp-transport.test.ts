import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createMCPClient,
  WebMCPTransport,
  type MCPClient,
  type CallToolResult,
  type WebMCPModelContext,
  type WebMCPTool,
} from '../index';

const cart: WebMCPTool = {
  name: 'getCart',
  title: 'Shopping cart',
  description: 'Read the current cart',
  origin: 'https://shop.example',
  window: {},
};

describe('WebMCPTransport', () => {
  let client: MCPClient | undefined;

  afterEach(async () => {
    await client?.close();
    client = undefined;
  });

  async function connect({
    tools = [cart],
    executeTool = vi
      .fn<WebMCPModelContext['executeTool']>()
      .mockResolvedValue('{"items":2}'),
    fromOrigins,
  }: {
    tools?: WebMCPTool[];
    executeTool?: WebMCPModelContext['executeTool'];
    fromOrigins?: string[];
  } = {}) {
    const modelContext = {
      getTools: vi
        .fn<WebMCPModelContext['getTools']>()
        .mockResolvedValue(tools),
      executeTool,
    };
    const transport = new WebMCPTransport({ modelContext, fromOrigins });
    client = await createMCPClient({ transport });
    return { client, transport, modelContext };
  }

  it('discovers tools through the public client and preserves schemas and browser metadata', async () => {
    const tool = {
      ...cart,
      inputSchema: { type: 'object', additionalProperties: { type: 'string' } },
      outputSchema: {
        type: 'object',
        properties: { items: { type: 'number' } },
      },
      annotations: {
        readOnlyHint: true,
        untrustedContentHint: true,
        consequentialHint: false,
        debugging: false,
      },
    };
    const { client, modelContext } = await connect({
      tools: [tool],
      fromOrigins: ['https://shop.example'],
    });

    expect(client.serverInfo.name).toBe('webmcp');
    expect(client.initializeResult.capabilities).toEqual({ tools: {} });
    const definitions = await client.listTools();
    expect(modelContext.getTools).toHaveBeenCalledWith({
      fromOrigins: ['https://shop.example'],
    });
    expect(definitions.tools).toEqual([
      {
        name: tool.name,
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema,
        annotations: { readOnlyHint: true },
        _meta: {
          'ai-sdk.dev/webmcp': {
            name: tool.name,
            origin: tool.origin,
            annotations: tool.annotations,
          },
        },
      },
    ]);
    expect(JSON.stringify(definitions)).not.toContain('window');
  });

  it.each([
    ['{"items":2}', { items: 2 }, '{"items":2}'],
    ['"Cart is empty"', 'Cart is empty', 'Cart is empty'],
    ['null', null, 'null'],
    ['[1,true]', [1, true], '[1,true]'],
    [
      '{"isError":true,"content":[]}',
      { isError: true, content: [] },
      '{"isError":true,"content":[]}',
    ],
  ])(
    'converts the serialized WebMCP result %s without treating application data as an MCP envelope',
    async (serialized, value, text) => {
      const executeTool = vi
        .fn<WebMCPModelContext['executeTool']>()
        .mockResolvedValue(serialized);
      const { client } = await connect({ executeTool });
      const tools = await client.tools();
      expect(tools.getCart.inputSchema).toBeDefined();
      const result = await tools.getCart.execute({ productId: 'shirt' });

      expect(executeTool).toHaveBeenCalledWith(
        cart,
        { productId: 'shirt' },
        { signal: expect.any(AbortSignal) },
      );
      expect(result).toMatchObject({
        content: [{ type: 'text', text }],
        structuredContent: value,
      });
      expect(
        await tools.getCart.toModelOutput!({
          toolCallId: '1',
          input: {},
          output: result as CallToolResult,
        }),
      ).toEqual({ type: 'content', value: [{ type: 'text', text }] });
    },
  );

  it('discovers before a direct call and supplies an empty object for omitted input', async () => {
    const { client, modelContext } = await connect();
    await client.callTool({ name: 'getCart' });
    expect(modelContext.getTools).toHaveBeenCalledOnce();
    expect(modelContext.executeTool).toHaveBeenCalledWith(
      cart,
      {},
      { signal: expect.any(AbortSignal) },
    );
  });

  it('keeps colliding tool names bound to their original frame and origin across rediscovery', async () => {
    const otherFrame = { ...cart, window: {} };
    const otherOrigin = { ...cart, origin: 'https://other.example' };
    const suffixed = { ...cart, name: 'getCart_2' };
    const { client, modelContext } = await connect({
      tools: [cart, otherFrame, otherOrigin, suffixed],
    });
    const first = await client.listTools();
    expect(first.tools.map(tool => tool.name)).toEqual([
      'getCart',
      'getCart_2',
      'getCart_3',
      'getCart_2_2',
    ]);

    modelContext.getTools.mockResolvedValue([
      suffixed,
      otherOrigin,
      otherFrame,
    ]);
    expect((await client.listTools()).tools.map(tool => tool.name)).toEqual([
      'getCart_2_2',
      'getCart_3',
      'getCart_2',
    ]);
    await client.callTool({ name: 'getCart_2' });
    expect(modelContext.executeTool).toHaveBeenLastCalledWith(
      otherFrame,
      {},
      { signal: expect.any(AbortSignal) },
    );
    await expect(client.callTool({ name: 'getCart' })).rejects.toMatchObject({
      code: -32602,
    });
  });

  it('refreshes schemas and definitions when tools are listed again', async () => {
    const { client, modelContext } = await connect();
    expect((await client.listTools()).tools[0].inputSchema).toEqual({
      type: 'object',
      properties: {},
    });
    const updated = {
      ...cart,
      description: 'Updated cart',
      inputSchema: {
        type: 'object',
        properties: { currency: { type: 'string' } },
      },
    };
    modelContext.getTools.mockResolvedValue([updated]);
    expect((await client.listTools()).tools[0]).toMatchObject({
      name: 'getCart',
      description: updated.description,
      inputSchema: updated.inputSchema,
    });
    await client.callTool({ name: 'getCart' });
    expect(modelContext.executeTool).toHaveBeenLastCalledWith(
      updated,
      {},
      { signal: expect.any(AbortSignal) },
    );
  });

  it('reports callback failures as tool errors and permission failures as request errors', async () => {
    const executeTool = vi
      .fn<WebMCPModelContext['executeTool']>()
      .mockRejectedValueOnce(
        // Errors from another frame or a browser bridge need not inherit
        // from this realm's Error constructor.
        { name: 'OperationError', message: 'Cart service unavailable' },
      )
      .mockRejectedValueOnce(
        new DOMException('Tools are disabled', 'NotAllowedError'),
      );
    const { client } = await connect({ executeTool });
    expect(await client.callTool({ name: 'getCart' })).toMatchObject({
      isError: true,
      content: [{ type: 'text', text: 'Cart service unavailable' }],
    });
    await expect(client.callTool({ name: 'getCart' })).rejects.toThrow(
      'Tools are disabled',
    );
  });

  it('rejects malformed JSON results instead of returning invalid structured content', async () => {
    const { client } = await connect({ executeTool: async () => 'not JSON' });
    await expect(client.callTool({ name: 'getCart' })).rejects.toMatchObject({
      code: -32603,
    });
  });

  it.each(['abort', 'close'] as const)(
    'cancels the browser invocation on %s',
    async action => {
      let started!: () => void;
      const executionStarted = new Promise<void>(resolve => {
        started = resolve;
      });
      let executionSignal: AbortSignal | undefined;
      const { client } = await connect({
        executeTool: async (_tool, _input, options) =>
          new Promise<string>((_resolve, reject) => {
            executionSignal = options!.signal!;
            executionSignal.addEventListener(
              'abort',
              () => reject(executionSignal!.reason),
              { once: true },
            );
            started();
          }),
      });
      const controller = new AbortController();
      const invocation = client.callTool({
        name: 'getCart',
        options: { signal: controller.signal },
      });
      const rejected = expect(invocation).rejects.toThrow();
      await executionStarted;
      if (action === 'abort') {
        controller.abort();
      } else {
        await client.close();
      }
      await rejected;
      expect(executionSignal?.aborted).toBe(true);
    },
  );

  it('returns JSON-RPC errors for unsupported methods and invalid arguments', async () => {
    const { transport, modelContext } = await connect();
    const onmessage = vi.fn();
    transport.onmessage = onmessage;
    await transport.send({ jsonrpc: '2.0', id: 1, method: 'unknown' });
    expect(onmessage).toHaveBeenLastCalledWith({
      jsonrpc: '2.0',
      id: 1,
      error: { code: -32601, message: 'Unsupported WebMCP method: unknown' },
    });
    await transport.send({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'getCart', arguments: [] },
    });
    expect(onmessage).toHaveBeenLastCalledWith({
      jsonrpc: '2.0',
      id: 2,
      error: { code: -32602, message: 'Invalid WebMCP tool call' },
    });
    expect(modelContext.executeTool).not.toHaveBeenCalled();
  });
});
