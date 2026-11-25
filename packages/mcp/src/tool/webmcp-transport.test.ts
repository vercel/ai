import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createMCPClient,
  Experimental_WebMCPTransport as WebMCPTransport,
  type MCPClient,
  type CallToolResult,
  type Experimental_WebMCPModelContext as WebMCPModelContext,
  type Experimental_WebMCPTool as WebMCPTool,
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
        name: expect.stringMatching(/^webmcp_[A-Za-z0-9_-]{43}_getCart$/),
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

  it('keeps same-named tools with different sources bound to their own frames', async () => {
    const page: WebMCPTool = {
      name: cart.name,
      description: cart.description,
      origin: cart.origin,
      source: {},
    };
    const frame = { ...page, source: {} };
    const { client, modelContext } = await connect({ tools: [page, frame] });

    const { tools } = await client.listTools();
    expect(tools.map(tool => tool.name)).toEqual(['getCart', 'getCart_2']);

    modelContext.getTools.mockResolvedValue([frame, page]);
    expect((await client.listTools()).tools.map(tool => tool.name)).toEqual([
      'getCart_2',
      'getCart',
    ]);

    await client.callTool({ name: 'getCart' });
    expect(modelContext.executeTool).toHaveBeenLastCalledWith(
      page,
      {},
      { signal: expect.any(AbortSignal) },
    );
    await client.callTool({ name: 'getCart_2' });
    expect(modelContext.executeTool).toHaveBeenLastCalledWith(
      frame,
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

  it('namespaces every origin before assigning aliases, even when a secondary origin appears first', async () => {
    const secondary = { ...cart, origin: 'https://other.example', window: {} };
    const fromOrigins = [secondary.origin];
    const first = await connect({ tools: [secondary], fromOrigins });
    const secondaryName = (await first.client.listTools()).tools[0].name;

    expect(secondaryName).toMatch(/^webmcp_[A-Za-z0-9_-]{43}_getCart$/);
    expect(secondaryName.length).toBeLessThanOrEqual(64);
    expect((await first.client.tools()).getCart).toBeUndefined();
    await expect(
      first.client.callTool({
        name: 'getCart',
        arguments: { secret: 'input' },
      }),
    ).rejects.toMatchObject({ code: -32602 });
    expect(first.modelContext.executeTool).not.toHaveBeenCalled();

    first.modelContext.getTools.mockResolvedValue([secondary, cart]);
    const names = (await first.client.listTools()).tools.map(tool => tool.name);
    expect(names[0]).toBe(secondaryName);
    expect(names[1]).not.toBe(secondaryName);
    await first.client.callTool({ name: names[1] });
    expect(first.modelContext.executeTool).toHaveBeenLastCalledWith(
      cart,
      {},
      { signal: expect.any(AbortSignal) },
    );
    await first.client.close();

    const second = await connect({ tools: [cart, secondary], fromOrigins });
    expect(
      (await second.client.listTools()).tools.map(tool => tool.name),
    ).toEqual([...names].reverse());
  });

  it('keeps origin namespaces intact for long and crafted tool names', async () => {
    const { client, modelContext } = await connect({
      fromOrigins: ['https://other.example'],
    });
    const trustedName = (await client.listTools()).tools[0].name;
    const secondary = { ...cart, origin: 'https://other.example', window: {} };
    modelContext.getTools.mockResolvedValue([
      { ...secondary, name: trustedName },
      { ...cart, name: 'x'.repeat(128) },
      { ...cart, name: `${'x'.repeat(127)}y` },
      { ...secondary, name: 'x'.repeat(128) },
    ]);
    const names = (await client.listTools()).tools.map(tool => tool.name);

    expect(new Set(names).size).toBe(4);
    expect(names).not.toContain(trustedName);
    for (const name of names) {
      expect(name).toMatch(/^webmcp_[A-Za-z0-9_-]{43}_/);
      expect(name.length).toBeLessThanOrEqual(64);
    }
    expect(names[1].slice(0, 51)).toBe(names[2].slice(0, 51));
    expect(names[1].slice(0, 51)).not.toBe(names[3].slice(0, 51));
  });

  it('releases removed descriptors while reserving aliases for their original owners', async () => {
    const { client, modelContext, transport } = await connect();
    await client.listTools();
    modelContext.getTools.mockResolvedValue([]);
    await client.listTools();
    expect(transport).toHaveProperty('tools', new Map());
    await expect(client.callTool({ name: 'getCart' })).rejects.toMatchObject({
      code: -32602,
    });

    const replacement = { ...cart, window: {} };
    modelContext.getTools.mockResolvedValue([replacement]);
    expect((await client.listTools()).tools[0].name).toBe('getCart_2');
    modelContext.getTools.mockResolvedValue([cart]);
    expect((await client.listTools()).tools[0].name).toBe('getCart');
  });

  it('skips new registrations from an exhausted origin without recycling approved names', async () => {
    const { client, modelContext } = await connect();
    await client.listTools();
    for (let i = 1; i < 1024; i++) {
      modelContext.getTools.mockResolvedValue([{ ...cart, name: `tool_${i}` }]);
      await client.listTools();
    }

    const last = { ...cart, name: 'tool_1023' };
    modelContext.getTools.mockResolvedValue([{ ...cart, window: {} }, last]);
    expect((await client.listTools()).tools.map(tool => tool.name)).toEqual([
      last.name,
    ]);
    await client.callTool({ name: last.name });
    expect(modelContext.executeTool).toHaveBeenLastCalledWith(
      last,
      {},
      { signal: expect.any(AbortSignal) },
    );
    await expect(client.callTool({ name: 'getCart' })).rejects.toMatchObject({
      code: -32602,
    });

    modelContext.getTools.mockResolvedValue([]);
    expect((await client.listTools()).tools).toEqual([]);
    await expect(client.callTool({ name: 'tool_1023' })).rejects.toMatchObject({
      code: -32602,
    });
    modelContext.getTools.mockResolvedValue([cart]);
    expect((await client.listTools()).tools[0].name).toBe('getCart');
  });

  it('limits an oversized snapshot per origin without excluding trusted tools listed last', async () => {
    const secondary = { ...cart, origin: 'https://other.example', window: {} };
    const { client, modelContext } = await connect({
      tools: [
        ...Array.from({ length: 1025 }, (_, i) => ({
          ...secondary,
          name: `tool_${i}`,
        })),
        cart,
      ],
      fromOrigins: [secondary.origin],
    });
    const definitions = await client.listTools();
    expect(definitions.tools).toHaveLength(1025);
    const trustedName = definitions.tools[1024].name;
    await client.callTool({ name: trustedName });
    expect(modelContext.executeTool).toHaveBeenLastCalledWith(
      cart,
      {},
      { signal: expect.any(AbortSignal) },
    );
    modelContext.getTools.mockResolvedValue([cart]);
    expect((await client.listTools()).tools.map(tool => tool.name)).toEqual([
      trustedName,
    ]);
  });

  it('isolates rotating origin quotas and admits new trusted tools after the secondary frame is removed', async () => {
    const secondary = { ...cart, origin: 'https://other.example', window: {} };
    const { client, modelContext } = await connect({
      fromOrigins: [secondary.origin],
    });
    const trustedName = (await client.listTools()).tools[0].name;
    let secondaryName: string | undefined;
    for (let i = 0; i < 1024; i++) {
      modelContext.getTools.mockResolvedValue([
        { ...secondary, name: `rotating_${i}` },
        cart,
      ]);
      const listed = await client.listTools();
      expect(listed.tools).toHaveLength(2);
      secondaryName = listed.tools[0].name;
    }

    const newTrusted = { ...cart, name: 'newTrustedTool' };
    modelContext.getTools.mockResolvedValue([
      { ...secondary, name: 'overflow' },
      cart,
      newTrusted,
    ]);
    const listed = await client.listTools();
    expect(listed.tools.map(tool => tool._meta?.['ai-sdk.dev/webmcp'])).toEqual(
      [
        expect.objectContaining({ name: cart.name, origin: cart.origin }),
        expect.objectContaining({ name: newTrusted.name, origin: cart.origin }),
      ],
    );
    expect(listed.tools[0].name).toBe(trustedName);
    await client.callTool({ name: trustedName });
    await expect(
      client.callTool({ name: secondaryName! }),
    ).rejects.toMatchObject({
      code: -32602,
    });

    modelContext.getTools.mockResolvedValue([newTrusted]);
    expect((await client.listTools()).tools.map(tool => tool.name)).toEqual([
      listed.tools[1].name,
    ]);
    await client.callTool({ name: listed.tools[1].name });
    expect(modelContext.executeTool).toHaveBeenLastCalledWith(
      newTrusted,
      {},
      { signal: expect.any(AbortSignal) },
    );
    await expect(client.callTool({ name: trustedName })).rejects.toMatchObject({
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

  it.each([
    'not JSON: private result',
    '{"items":2,"private":"private result","__proto__":{}}',
  ])(
    'rejects invalid results without exposing their contents: %s',
    async text => {
      const { client, transport } = await connect({
        executeTool: async () => text,
      });
      const onmessage = vi.fn(transport.onmessage!);
      transport.onmessage = onmessage;

      await expect(client.callTool({ name: 'getCart' })).rejects.toMatchObject({
        code: -32603,
        message: 'Invalid JSON returned by WebMCP tool',
      });
      expect(onmessage).toHaveBeenLastCalledWith({
        jsonrpc: '2.0',
        id: expect.any(Number),
        error: {
          code: -32603,
          message: 'Invalid JSON returned by WebMCP tool',
        },
      });
    },
  );

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
