import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ToolListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  startHostToolRelay,
  type HostToolRelay,
  type HostToolRelayTurn,
} from './host-tool-relay';

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  const pending = cleanups.splice(0, cleanups.length).reverse();
  for (const cleanup of pending) await cleanup();
});

describe('host tool MCP HTTP transport', () => {
  it('exposes an MCP endpoint alongside the relay endpoint', async () => {
    const relay = await createRelay({
      tools: [{ name: 'weather', inputSchema: { type: 'object' } }],
    });

    expect(relay.mcpUrl).toBe(new URL('/mcp', relay.url).toString());
  });

  it('omits the MCP endpoint for the stdio transport', async () => {
    const relay = await createRelay({
      tools: [{ name: 'weather', inputSchema: { type: 'object' } }],
      mcpTransport: 'stdio',
    });

    expect(relay.mcpUrl).toBeUndefined();
  });

  it('lists host tools, acknowledges the catalog, and invokes through the turn', async () => {
    const emitToolCall = vi.fn();
    const emitToolResult = vi.fn();
    const registerCorrelationInvocation = vi.fn();
    const relay = await createRelay({
      tools: [
        {
          name: 'weather',
          description: 'Get the current temperature for a city.',
          inputSchema: {
            type: 'object',
            properties: { city: { type: 'string' } },
          },
        },
      ],
    });
    relay.bindTurn({
      turn: createTurn({
        emitToolCall,
        emitToolResult,
        registerCorrelationInvocation,
        requestToolResult: async () => ({ output: { celsius: 12 } }),
      }),
    });
    const client = await connect({ relay });

    const listed = await client.listTools();
    expect(listed.tools).toEqual([
      {
        name: 'weather',
        description: 'Get the current temperature for a city.',
        inputSchema: {
          type: 'object',
          properties: { city: { type: 'string' } },
        },
      },
    ]);
    await expect(
      relay.waitForCatalogRefresh({ revision: 1, timeoutMs: 5_000 }),
    ).resolves.toBe(true);

    const result = await client.callTool({
      name: 'weather',
      arguments: { city: 'Paris' },
    });
    expect(result).toMatchObject({
      content: [{ type: 'text', text: '{"celsius":12}' }],
      _meta: {
        'ai-sdk-harness-acp-correlation':
          expect.stringMatching(/^[a-f0-9]{64}$/),
      },
    });
    expect(emitToolCall).toHaveBeenCalledWith({
      toolCallId: expect.any(String),
      toolName: 'weather',
      input: { city: 'Paris' },
    });
    expect(emitToolResult).toHaveBeenCalledWith({
      toolCallId: expect.any(String),
      toolName: 'weather',
      output: { celsius: 12 },
    });
    expect(registerCorrelationInvocation).toHaveBeenCalledWith({
      token: expect.stringMatching(/^[a-f0-9]{64}$/),
      serverName: 'ai-sdk-harness-tools',
      toolName: 'weather',
      input: { city: 'Paris' },
      order: 1,
    });
  });

  it('notifies the connected session when the catalog changes', async () => {
    const relay = await createRelay({
      tools: [{ name: 'weather', inputSchema: { type: 'object' } }],
    });
    const client = await connect({ relay });
    const listChanged = vi.fn();
    client.setNotificationHandler(
      ToolListChangedNotificationSchema,
      listChanged,
    );
    await client.listTools();

    const updated = relay.updateCatalog({
      tools: [
        { name: 'weather', inputSchema: { type: 'object' } },
        { name: 'clock', inputSchema: { type: 'object' } },
      ],
    });
    expect(updated).toEqual({ changed: true, revision: 2 });

    await vi.waitFor(() => {
      expect(listChanged).toHaveBeenCalled();
    });
    const listed = await client.listTools();
    expect(listed.tools.map(tool => tool.name)).toEqual(['weather', 'clock']);
    await expect(
      relay.waitForCatalogRefresh({ revision: 2, timeoutMs: 5_000 }),
    ).resolves.toBe(true);
  });

  it('rejects tool invocations from a stale catalog revision', async () => {
    const relay = await createRelay({
      tools: [{ name: 'weather', inputSchema: { type: 'object' } }],
    });
    relay.bindTurn({
      turn: createTurn({
        requestToolResult: async () => ({ output: { celsius: 12 } }),
      }),
    });
    const client = await connect({ relay });
    await client.listTools();
    relay.updateCatalog({
      tools: [{ name: 'clock', inputSchema: { type: 'object' } }],
    });

    await expect(
      client.callTool({ name: 'weather', arguments: {} }),
    ).rejects.toThrow(/Unknown host tool: weather/);
  });

  it('rejects MCP requests without the relay credential', async () => {
    const relay = await createRelay({
      tools: [{ name: 'weather', inputSchema: { type: 'object' } }],
    });

    const response = await fetch(relay.mcpUrl!, {
      method: 'POST',
      headers: {
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0.0' },
        },
      }),
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: 'Invalid host tool relay credential.',
    });
  });

  it('rejects session-less requests that are not an initialize request', async () => {
    const relay = await createRelay({
      tools: [{ name: 'weather', inputSchema: { type: 'object' } }],
    });

    const response = await fetch(relay.mcpUrl!, {
      method: 'POST',
      headers: {
        accept: 'application/json, text/event-stream',
        authorization: `Bearer ${relay.credential}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        message:
          'Host tool MCP requests without a session id must be an initialize request.',
      },
    });
  });

  it('rejects requests for an unknown MCP session', async () => {
    const relay = await createRelay({
      tools: [{ name: 'weather', inputSchema: { type: 'object' } }],
    });

    const response = await fetch(relay.mcpUrl!, {
      method: 'GET',
      headers: {
        accept: 'text/event-stream',
        authorization: `Bearer ${relay.credential}`,
        'mcp-session-id': 'not-a-live-session',
      },
    });

    expect(response.status).toBe(404);
  });
});

async function createRelay({
  tools,
  mcpTransport = 'http',
}: {
  tools: Parameters<typeof startHostToolRelay>[0]['tools'];
  mcpTransport?: Parameters<typeof startHostToolRelay>[0]['mcpTransport'];
}): Promise<HostToolRelay> {
  const relay = await startHostToolRelay({
    tools,
    serverName: 'ai-sdk-harness-tools',
    mcpTransport,
  });
  cleanups.push(() => relay.close());
  return relay;
}

async function connect({ relay }: { relay: HostToolRelay }): Promise<Client> {
  const client = new Client({ name: 'host-tool-test', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(relay.mcpUrl!), {
    requestInit: {
      headers: { authorization: `Bearer ${relay.credential}` },
    },
  });
  await client.connect(transport);
  cleanups.push(() => client.close());
  return client;
}

function createTurn({
  emitToolCall = vi.fn(),
  emitToolResult = vi.fn(),
  registerCorrelationInvocation = vi.fn(),
  removeCorrelationInvocation = vi.fn(),
  requestToolResult,
}: {
  emitToolCall?: HostToolRelayTurn['emitToolCall'];
  emitToolResult?: HostToolRelayTurn['emitToolResult'];
  registerCorrelationInvocation?: HostToolRelayTurn['registerCorrelationInvocation'];
  removeCorrelationInvocation?: HostToolRelayTurn['removeCorrelationInvocation'];
  requestToolResult: HostToolRelayTurn['requestToolResult'];
}): HostToolRelayTurn {
  return {
    emitToolCall,
    emitToolResult,
    registerCorrelationInvocation,
    removeCorrelationInvocation,
    requestToolResult,
  };
}
