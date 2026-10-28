import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ToolListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  startHostToolRelay,
  type HostToolRelay,
  type HostToolRelayTurn,
} from './host-tool-relay';
import { createHostToolRelayAuthorization } from './host-tool-relay-authorization';

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  const pending = cleanups.splice(0).reverse();
  for (const cleanup of pending) await cleanup();
});

describe('host tool MCP HTTP transport', () => {
  it('returns empty MCP content for undeclared image-only output without a placeholder', async () => {
    const relay = await startHostToolRelay({
      tools: [{ name: 'inspect', inputSchema: { type: 'object' } }],
      serverName: 'ai-sdk-harness-tools',
      mcpTransport: 'http',
    });
    cleanups.push(() => relay.close());
    const turn = createTurn({
      requestToolResult: async () => ({
        output: { status: 'ready' },
        toolResult: {
          type: 'tool-result',
          toolCallId: 'call',
          toolName: 'inspect',
          output: {
            type: 'content',
            value: [
              {
                type: 'file',
                mediaType: 'image/png',
                data: { type: 'data', data: 'AQID' },
              },
            ],
          },
        },
      }),
    });
    relay.bindTurn({ turn });
    const client = await connect({ relay });
    expect(
      await client.callTool({ name: 'inspect', arguments: {} }),
    ).toMatchObject({ content: [] });
    expect(turn.emitWarning).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])(
    'converts mixed model output over HTTP with image support %s',
    async supportsImages => {
      const relay = await startHostToolRelay({
        tools: [{ name: 'inspect', inputSchema: { type: 'object' } }],
        serverName: 'ai-sdk-harness-tools',
        mcpTransport: 'http',
        nonTextContentTypes: supportsImages ? ['image'] : [],
      });
      cleanups.push(() => relay.close());
      const turn = createTurn({
        requestToolResult: async () => ({
          output: { status: 'ready' },
          toolResult: {
            type: 'tool-result',
            toolCallId: 'call',
            toolName: 'inspect',
            output: {
              type: 'content',
              value: [
                { type: 'text', text: 'marker' },
                {
                  type: 'file',
                  mediaType: 'image/png',
                  data: { type: 'data', data: 'aW1hZ2U=' },
                },
              ],
            },
          },
        }),
      });
      relay.bindTurn({ turn });
      const client = await connect({ relay });
      expect(
        await client.callTool({ name: 'inspect', arguments: {} }),
      ).toMatchObject({
        content: [
          { type: 'text', text: 'marker' },
          ...(supportsImages
            ? [{ type: 'image', mimeType: 'image/png', data: 'aW1hZ2U=' }]
            : []),
        ],
      });
      expect(turn.emitWarning).toHaveBeenCalledTimes(supportsImages ? 0 : 1);
      expect(turn.emitToolResult).toHaveBeenCalledWith(
        expect.objectContaining({ output: { status: 'ready' } }),
      );
    },
  );

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

  it('requires an ACP tool call for the HTTP MCP transport as well', async () => {
    const relay = await createRelay({
      tools: [{ name: 'weather', inputSchema: { type: 'object' } }],
    });
    const authorization = createHostToolRelayAuthorization({
      serverName: 'ai-sdk-harness-tools',
      toolNames: ['weather'],
      ttlMs: 20,
    });
    cleanups.push(async () => authorization.close());
    let notifyAuthorizationRequest: (() => void) | undefined;
    const turn = createTurn({
      waitForToolCallAuthorization: options => {
        const pending = authorization.waitForToolCallAuthorization(options);
        notifyAuthorizationRequest?.();
        return pending;
      },
      requestToolResult: vi.fn(async () => ({ output: { celsius: 12 } })),
    });
    relay.bindTurn({ turn });
    const client = await connect({ relay });

    await expect(
      client.callTool({ name: 'weather', arguments: { city: 'Paris' } }),
    ).rejects.toThrow(/Unauthorized host tool relay request/);
    expect(turn.emitToolCall).not.toHaveBeenCalled();
    expect(turn.requestToolResult).not.toHaveBeenCalled();

    const authorizationRequested = new Promise<void>(resolve => {
      notifyAuthorizationRequest = resolve;
    });
    const authorizedCall = client.callTool({
      name: 'weather',
      arguments: { city: 'Paris' },
    });
    await authorizationRequested;
    authorization.observeUpdate({
      update: {
        sessionUpdate: 'tool_call',
        toolCallId: 'model-call',
        title: 'Weather',
        name: 'mcp__ai-sdk-harness-tools__weather',
        rawInput: { city: 'Paris' },
        status: 'in_progress',
      },
    });
    await expect(authorizedCall).resolves.toMatchObject({
      content: [{ type: 'text', text: '{"celsius":12}' }],
    });
    expect(turn.emitToolCall).toHaveBeenCalledTimes(1);
    expect(turn.requestToolResult).toHaveBeenCalledTimes(1);
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
  waitForToolCallAuthorization = async () => true,
  emitToolCall = vi.fn(),
  emitToolResult = vi.fn(),
  registerCorrelationInvocation = vi.fn(),
  removeCorrelationInvocation = vi.fn(),
  requestToolResult,
}: {
  waitForToolCallAuthorization?: HostToolRelayTurn['waitForToolCallAuthorization'];
  emitToolCall?: HostToolRelayTurn['emitToolCall'];
  emitToolResult?: HostToolRelayTurn['emitToolResult'];
  registerCorrelationInvocation?: HostToolRelayTurn['registerCorrelationInvocation'];
  removeCorrelationInvocation?: HostToolRelayTurn['removeCorrelationInvocation'];
  requestToolResult: HostToolRelayTurn['requestToolResult'];
}): HostToolRelayTurn {
  return {
    waitForToolCallAuthorization,
    emitWarning: vi.fn(),
    emitToolCall,
    emitToolResult,
    registerCorrelationInvocation,
    removeCorrelationInvocation,
    requestToolResult,
  };
}
