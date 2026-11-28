import { asSchema } from '@ai-sdk/provider-utils';
import { describe, expect, it } from 'vitest';
import { createMCPTools, MCPClientError } from '../index';

describe('createMCPTools', () => {
  it('creates dynamic tools without execute functions or a connection', async () => {
    const definitions = [
      {
        name: 'getCart',
        description: 'Read the cart',
        inputSchema: { type: 'object' },
        // Even if provided in local input, executable code is never forwarded.
        execute: () => 'unexpected',
      },
    ];
    const tools = createMCPTools(definitions);

    expect(Object.keys(tools)).toEqual(['getCart']);
    expect(tools.getCart.type).toBe('dynamic');
    expect(tools.getCart.description).toBe('Read the cart');
    expect(tools.getCart).not.toHaveProperty('execute');
    expect(await asSchema(tools.getCart.inputSchema).jsonSchema).toEqual({
      type: 'object',
      properties: {},
      additionalProperties: false,
    });
    expect(definitions[0].inputSchema).toEqual({ type: 'object' });
    expect(Object.keys(createMCPTools([]))).toEqual([]);
  });

  it('preserves schemas, titles, annotations, and MCP metadata', async () => {
    const inputSchema = {
      type: 'object',
      properties: { currency: { type: 'string', enum: ['USD', 'EUR'] } },
      required: ['currency'],
    };
    const annotations = { title: 'Fallback title', readOnlyHint: true };
    const _meta = {
      'ai-sdk.dev/webmcp': { name: 'getCart', origin: 'https://shop.example' },
      ui: { resourceUri: 'ui://cart/view.html' },
    };
    const { getCart } = createMCPTools([
      { name: 'getCart', title: 'Cart', inputSchema, annotations, _meta },
    ]);

    expect(await asSchema(getCart.inputSchema).jsonSchema).toEqual({
      ...inputSchema,
      additionalProperties: false,
    });
    expect(getCart.title).toBe('Cart');
    expect(getCart.metadata).toEqual({
      toolName: 'getCart',
      title: 'Cart',
      annotations,
      app: {
        resourceUri: 'ui://cart/view.html',
        mimeType: 'text/html;profile=mcp-app',
      },
    });
    expect(getCart._meta).toEqual(_meta);
    expect(
      createMCPTools([{ name: 'getCart', inputSchema, annotations }]).getCart
        .title,
    ).toBe('Fallback title');
  });

  it('converts forwarded MCP results into model content', async () => {
    const { getCart } = createMCPTools([
      { name: 'getCart', inputSchema: { type: 'object' } },
    ]);

    expect(
      await getCart.toModelOutput!({
        toolCallId: 'call-1',
        input: {},
        output: {
          content: [
            { type: 'text', text: 'Cart total: $75' },
            { type: 'image', data: 'aGVsbG8=', mimeType: 'image/png' },
          ],
        },
      }),
    ).toEqual({
      type: 'content',
      value: [
        { type: 'text', text: 'Cart total: $75' },
        {
          type: 'file',
          mediaType: 'image/png',
          data: { type: 'data', data: 'aGVsbG8=' },
        },
      ],
    });
  });

  it.each([
    undefined,
    {},
    [null],
    [{ name: 'getCart' }],
    [{ name: 42, inputSchema: {} }],
    [{ name: 'getCart', inputSchema: 'invalid' }],
    [
      {
        name: 'getCart',
        inputSchema: {},
        annotations: { readOnlyHint: 'yes' },
      },
    ],
  ])('rejects malformed tool definitions: %j', definitions => {
    expect(() => createMCPTools(definitions)).toThrow(MCPClientError);
    expect(() => createMCPTools(definitions)).toThrow(
      'Invalid MCP tool definitions',
    );
  });

  it('rejects duplicate names instead of silently replacing tools', () => {
    expect(() =>
      createMCPTools([
        { name: 'getCart', inputSchema: {} },
        { name: 'getCart', inputSchema: {} },
      ]),
    ).toThrow('Duplicate MCP tool name "getCart"');
  });

  it.each([
    { ui: { resourceUri: 'https://example.com/cart' } },
    { ui: { resourceUri: 42 } },
    { 'ui/resourceUri': 'https://example.com/cart' },
    { 'ui/resourceUri': 42 },
  ])('wraps invalid MCP App resource URI metadata: %j', _meta => {
    let error: unknown;
    try {
      createMCPTools([{ name: 'getCart', inputSchema: {}, _meta }]);
    } catch (cause) {
      error = cause;
    }

    expect(MCPClientError.isInstance(error)).toBe(true);
    expect(error).toMatchObject({
      message: 'Invalid MCP tool definition "getCart"',
      cause: {
        message: expect.stringContaining('Invalid MCP App resource URI:'),
      },
    });
  });

  it('preserves prototype-named tools without modifying the record prototype', () => {
    const names = ['__proto__', 'constructor', 'toString'];
    const tools = createMCPTools(
      names.map(name => ({ name, inputSchema: { type: 'object' } })),
    );

    expect(Object.getPrototypeOf(tools)).toBeNull();
    expect(Object.keys(tools)).toEqual(names);
    for (const name of names) {
      expect(Object.prototype.hasOwnProperty.call(tools, name)).toBe(true);
      expect(tools[name].type).toBe('dynamic');
    }
  });

  it('converts isError text results to error-text model output', async () => {
    const tools = createMCPTools([
      { name: 'fail', inputSchema: { type: 'object' } },
    ]);

    const modelOutput = await tools.fail.toModelOutput!({
      toolCallId: 'call-1',
      input: {},
      output: {
        content: [{ type: 'text', text: 'tool reported failure' }],
        isError: true,
      },
    });

    expect(modelOutput).toEqual({
      type: 'error-text',
      value: 'tool reported failure',
    });
  });

  it('converts non-text or empty isError results to error-json model output', async () => {
    const tools = createMCPTools([
      { name: 'fail', inputSchema: { type: 'object' } },
    ]);
    const output = {
      content: [],
      isError: true,
    };

    const modelOutput = await tools.fail.toModelOutput!({
      toolCallId: 'call-2',
      input: {},
      output,
    });

    expect(modelOutput).toEqual({
      type: 'error-json',
      value: output,
    });
  });
});
