import type { AgentTool } from '@cline/agents';
import type { McpServerRegistration } from '@cline/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createClineMcpRuntime } from './cline-mcp';

const mcpMock = vi.hoisted(() => ({
  createMcpTools: vi.fn(),
  dispose: vi.fn(),
  registerServer: vi.fn(),
}));

vi.mock('@cline/core', () => ({
  createDefaultMcpServerClientFactory: vi.fn(() => 'client-factory'),
  createMcpTools: mcpMock.createMcpTools,
  InMemoryMcpManager: class {
    dispose = mcpMock.dispose;
    registerServer = mcpMock.registerServer;
  },
}));

describe('createClineMcpRuntime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mcpMock.dispose.mockResolvedValue(undefined);
    mcpMock.registerServer.mockResolvedValue(undefined);
    mcpMock.createMcpTools.mockResolvedValue([
      {
        name: 'context7__resolve-library-id',
        description: 'Resolve a library id.',
        inputSchema: { type: 'object' },
        execute: vi.fn(),
      } satisfies AgentTool,
    ]);
  });

  it('registers URL servers and exposes their tools', async () => {
    const runtime = await createClineMcpRuntime({
      mcpServers: {
        context7: {
          url: 'https://mcp.context7.com/mcp',
          auth: false,
        },
      },
    });

    expect(mcpMock.registerServer).toHaveBeenCalledWith({
      name: 'context7',
      transport: {
        type: 'sse',
        url: 'https://mcp.context7.com/mcp',
      },
    } satisfies McpServerRegistration);
    expect(mcpMock.createMcpTools).toHaveBeenCalledWith({
      serverName: 'context7',
      provider: expect.any(Object),
    });
    expect(runtime.tools.map(tool => tool.name)).toEqual([
      'context7__resolve-library-id',
    ]);
    expect(runtime.toolNames).toEqual(
      new Set(['context7__resolve-library-id']),
    );

    await runtime.dispose();
    expect(mcpMock.dispose).toHaveBeenCalledOnce();
  });

  it('registers stdio and nested transport configurations', async () => {
    mcpMock.createMcpTools.mockResolvedValue([]);

    await createClineMcpRuntime({
      mcpServers: {
        memory: {
          command: 'memory-mcp',
          args: ['--stdio'],
          env: { MEMORY_PATH: '/tmp/memory' },
        },
        docs: {
          transport: {
            type: 'streamableHttp',
            url: 'https://example.com/mcp',
          },
        },
      },
    });

    expect(mcpMock.registerServer.mock.calls.map(call => call[0]))
      .toMatchInlineSnapshot(`
        [
          {
            "name": "memory",
            "transport": {
              "args": [
                "--stdio",
              ],
              "command": "memory-mcp",
              "env": {
                "MEMORY_PATH": "/tmp/memory",
              },
              "type": "stdio",
            },
          },
          {
            "name": "docs",
            "transport": {
              "type": "streamableHttp",
              "url": "https://example.com/mcp",
            },
          },
        ]
      `);
  });

  it('does not connect disabled servers', async () => {
    const runtime = await createClineMcpRuntime({
      mcpServers: {
        disabled: {
          command: 'disabled-mcp',
          disabled: true,
        },
      },
    });

    expect(mcpMock.registerServer).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'disabled', disabled: true }),
    );
    expect(mcpMock.createMcpTools).not.toHaveBeenCalled();
    expect(runtime.tools).toEqual([]);
  });

  it('rejects non-object server definitions', async () => {
    await expect(
      createClineMcpRuntime({ mcpServers: { invalid: 'command' } }),
    ).rejects.toThrow(
      'Cline MCP server "invalid" must be configured with an object value.',
    );
    expect(mcpMock.dispose).toHaveBeenCalledOnce();
  });
});
