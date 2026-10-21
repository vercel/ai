import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { jsonSchemaToZodObject } from './json-schema-to-zod';

describe('tool input schema through MCP', () => {
  let server: McpServer;
  let client: Client;

  beforeEach(() => {
    server = new McpServer({ name: 'harness-tools', version: '1.0.0' });
    client = new Client({ name: 'test-client', version: '1.0.0' });
  });

  async function connect() {
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
  }

  afterEach(async () => {
    await client.close();
    await server.close();
  });

  it.each([undefined, true, {}])(
    'delivers open-object inputs unchanged with additionalProperties %j',
    async additionalProperties => {
      const handler = vi.fn(async () => ({ content: [] }));
      server.registerTool(
        'read',
        {
          inputSchema: jsonSchemaToZodObject({
            type: 'object',
            properties: {
              parameters: { type: 'object', additionalProperties },
            },
            required: ['parameters'],
            additionalProperties,
          }),
        },
        handler,
      );
      await connect();
      const input = {
        parameters: { customer: 'cus_example', limit: 1 },
        account: 'acct_example',
      };

      const result = await client.callTool({ name: 'read', arguments: input });

      expect(result.isError).not.toBe(true);
      expect(handler).toHaveBeenCalledExactlyOnceWith(input, expect.anything());
    },
  );

  it('advertises and validates typed additional properties before calling the handler', async () => {
    const handler = vi.fn(async () => ({ content: [] }));
    server.registerTool(
      'read',
      {
        inputSchema: jsonSchemaToZodObject({
          type: 'object',
          additionalProperties: { type: 'string' },
        }),
      },
      handler,
    );
    await connect();

    const { tools } = await client.listTools();
    expect(tools[0].inputSchema.additionalProperties).toEqual({
      type: 'string',
    });

    const input = { customer: 'cus_example' };
    const valid = await client.callTool({ name: 'read', arguments: input });
    expect(valid.isError).not.toBe(true);
    expect(handler).toHaveBeenCalledExactlyOnceWith(input, expect.anything());

    handler.mockClear();
    const invalid = await client.callTool({
      name: 'read',
      arguments: { limit: 1 },
    });
    expect(invalid.isError).toBe(true);
    expect(handler).not.toHaveBeenCalled();
  });
});
