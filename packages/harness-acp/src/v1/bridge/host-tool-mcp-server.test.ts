import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ToolListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
import { describe, expect, it, vi } from 'vitest';
import type { ToolResultOutput } from '@ai-sdk/provider-utils';
import { createHostToolMCPServer } from './host-tool-mcp-server';

describe('createHostToolMCPServer', () => {
  it.each([
    {
      output: { type: 'text', value: 'converted' },
      content: [{ type: 'text', text: 'converted' }],
      isError: false,
    },
    {
      output: { type: 'json', value: { converted: true } },
      content: [{ type: 'text', text: '{"converted":true}' }],
      isError: false,
    },
    {
      output: { type: 'error-text', value: 'failed' },
      content: [{ type: 'text', text: 'failed' }],
      isError: true,
    },
    {
      output: { type: 'error-json', value: { failed: true } },
      content: [{ type: 'text', text: '{"failed":true}' }],
      isError: true,
    },
    {
      output: { type: 'execution-denied', reason: 'denied' },
      content: [{ type: 'text', text: 'denied' }],
      isError: true,
    },
    { output: { type: 'content', value: [] }, content: [], isError: false },
    {
      output: {
        type: 'content',
        value: [
          { type: 'text', text: 'marker' },
          {
            type: 'file',
            mediaType: 'image/png',
            data: { type: 'data', data: 'aW1hZ2U=' },
          },
          {
            type: 'file',
            mediaType: 'image/jpeg',
            data: { type: 'data', data: 'anBlZw==' },
          },
        ],
      },
      content: [
        { type: 'text', text: 'marker' },
        { type: 'image', mimeType: 'image/png', data: 'aW1hZ2U=' },
        { type: 'image', mimeType: 'image/jpeg', data: 'anBlZw==' },
      ],
      isError: false,
    },
  ] satisfies Array<{
    output: ToolResultOutput;
    content: unknown[];
    isError: boolean;
  }>)(
    'converts $output.type without using the raw result',
    async ({ output, content, isError }) => {
      const { client, close } = await connect({
        tools: [{ name: 'inspect', inputSchema: { type: 'object' } }],
        invoke: async () => ({
          output: { raw: true },
          toolResult: {
            type: 'tool-result',
            toolCallId: 'call',
            toolName: 'inspect',
            output,
          },
          correlationToken: 'token',
        }),
      });
      try {
        expect(
          await client.callTool({ name: 'inspect', arguments: {} }),
        ).toEqual({
          content,
          ...(isError ? { isError: true } : {}),
          _meta: { 'ai-sdk-harness-acp-correlation': 'token' },
        });
      } finally {
        await close();
      }
    },
  );

  it('preserves raw execution errors with a successful converted output', async () => {
    const { client, close } = await connect({
      tools: [{ name: 'inspect', inputSchema: { type: 'object' } }],
      invoke: async () => ({
        output: 'raw error',
        isError: true,
        correlationToken: 'token',
        toolResult: {
          type: 'tool-result',
          toolCallId: 'call',
          toolName: 'inspect',
          output: { type: 'text', value: 'converted' },
        },
      }),
    });
    try {
      expect(
        await client.callTool({ name: 'inspect', arguments: {} }),
      ).toMatchObject({
        content: [{ type: 'text', text: 'converted' }],
        isError: true,
      });
    } finally {
      await close();
    }
  });

  it('rejects unsupported non-image content instead of serializing it', async () => {
    const { client, close } = await connect({
      tools: [{ name: 'inspect', inputSchema: { type: 'object' } }],
      invoke: async () => ({
        output: {},
        correlationToken: 'token',
        toolResult: {
          type: 'tool-result',
          toolCallId: 'call',
          toolName: 'inspect',
          output: {
            type: 'content',
            value: [
              {
                type: 'file',
                mediaType: 'audio/wav',
                data: { type: 'data', data: 'AQID' },
              },
            ],
          },
        },
      }),
    });
    try {
      await expect(
        client.callTool({ name: 'inspect', arguments: {} }),
      ).rejects.toThrow('Harnesses support only text and inline images');
    } finally {
      await close();
    }
  });

  it('preserves recursive JSON Schema and relays successful calls', async () => {
    const recursiveSchema = {
      type: 'object',
      properties: {
        node: { $ref: '#/$defs/node' },
      },
      required: ['node'],
      additionalProperties: false,
      $defs: {
        node: {
          type: 'object',
          properties: {
            value: { type: 'string', minLength: 2 },
            children: {
              type: 'array',
              items: { $ref: '#/$defs/node' },
            },
          },
          required: ['value'],
          additionalProperties: false,
        },
      },
    } as const;
    const invoke = vi.fn(async () => ({
      output: { accepted: true },
      correlationToken: 'opaque-token',
    }));
    const { client, close } = await connect({
      tools: [
        {
          name: 'walk_tree',
          description: 'Walk a recursive tree.',
          inputSchema: recursiveSchema,
        },
      ],
      invoke,
    });

    const listed = await client.listTools();
    expect(listed.tools).toMatchInlineSnapshot(`
      [
        {
          "description": "Walk a recursive tree.",
          "inputSchema": {
            "$defs": {
              "node": {
                "additionalProperties": false,
                "properties": {
                  "children": {
                    "items": {
                      "$ref": "#/$defs/node",
                    },
                    "type": "array",
                  },
                  "value": {
                    "minLength": 2,
                    "type": "string",
                  },
                },
                "required": [
                  "value",
                ],
                "type": "object",
              },
            },
            "additionalProperties": false,
            "properties": {
              "node": {
                "$ref": "#/$defs/node",
              },
            },
            "required": [
              "node",
            ],
            "type": "object",
          },
          "name": "walk_tree",
        },
      ]
    `);

    const input = { node: { value: 'root', children: [] } };
    const result = await client.callTool({
      name: 'walk_tree',
      arguments: input,
    });
    expect(invoke).toHaveBeenCalledWith({
      toolName: 'walk_tree',
      input,
      catalogRevision: 1,
    });
    expect(result).toMatchInlineSnapshot(`
      {
        "_meta": {
          "ai-sdk-harness-acp-correlation": "opaque-token",
        },
        "content": [
          {
            "text": "{"accepted":true}",
            "type": "text",
          },
        ],
      }
    `);

    await close();
  });

  it('announces changed and removed catalogs and serves their revisions', async () => {
    const onListTools = vi.fn(async (_options: { revision: number }) => {});
    const { client, updateCatalog, listChanged, close } = await connect({
      tools: [{ name: 'first', inputSchema: { type: 'object' } }],
      invoke: async () => ({
        output: {},
        correlationToken: 'token',
      }),
      onListTools,
    });

    await expect(client.listTools()).resolves.toMatchObject({
      tools: [{ name: 'first' }],
    });
    await updateCatalog({
      revision: 2,
      tools: [
        {
          name: 'second',
          description: 'Second revision.',
          inputSchema: { type: 'object' },
        },
      ],
    });
    await vi.waitFor(() => expect(listChanged).toHaveBeenCalledTimes(1));
    await expect(client.listTools()).resolves.toMatchObject({
      tools: [{ name: 'second', description: 'Second revision.' }],
    });

    await updateCatalog({ revision: 3, tools: [] });
    await vi.waitFor(() => expect(listChanged).toHaveBeenCalledTimes(2));
    await expect(client.listTools()).resolves.toEqual({ tools: [] });
    await expect(
      client.callTool({ name: 'second', arguments: {} }),
    ).rejects.toThrow('Unknown host tool: second');
    await vi.waitFor(() => expect(onListTools).toHaveBeenCalledTimes(3));
    expect(onListTools.mock.calls.map(([value]) => value)).toEqual([
      { revision: 1 },
      { revision: 2 },
      { revision: 3 },
    ]);

    await close();
  });

  it('returns host failures as MCP tool errors and rejects unknown tools', async () => {
    const { client, close } = await connect({
      tools: [{ name: 'fail', inputSchema: { type: 'object' } }],
      invoke: async () => ({
        output: { message: 'failed' },
        isError: true,
        correlationToken: 'failure-token',
      }),
    });

    await expect(client.callTool({ name: 'fail', arguments: {} })).resolves
      .toMatchInlineSnapshot(`
        {
          "_meta": {
            "ai-sdk-harness-acp-correlation": "failure-token",
          },
          "content": [
            {
              "text": "{"message":"failed"}",
              "type": "text",
            },
          ],
          "isError": true,
        }
      `);
    await expect(
      client.callTool({ name: 'missing', arguments: {} }),
    ).rejects.toThrow('Unknown host tool: missing');

    await close();
  });
});

async function connect({
  tools,
  invoke,
  onListTools,
}: {
  tools: Parameters<typeof createHostToolMCPServer>[0]['tools'];
  invoke: Parameters<typeof createHostToolMCPServer>[0]['invoke'];
  onListTools?: Parameters<typeof createHostToolMCPServer>[0]['onListTools'];
}): Promise<{
  client: Client;
  updateCatalog: ReturnType<typeof createHostToolMCPServer>['updateCatalog'];
  listChanged: ReturnType<typeof vi.fn>;
  close: () => Promise<void>;
}> {
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const hostToolServer = createHostToolMCPServer({
    tools,
    invoke,
    onListTools,
  });
  const client = new Client({
    name: 'harness-acp-test',
    version: '1.0.0',
  });
  const listChanged = vi.fn();
  client.setNotificationHandler(ToolListChangedNotificationSchema, listChanged);
  await Promise.all([
    hostToolServer.server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  return {
    client,
    updateCatalog: hostToolServer.updateCatalog,
    listChanged,
    close: async () => {
      await client.close();
      await hostToolServer.server.close();
    },
  };
}
