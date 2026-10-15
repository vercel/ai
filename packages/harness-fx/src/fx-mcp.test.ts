import { createMCPClient, type MCPClient } from '@ai-sdk/mcp';
import { HarnessCapabilityUnsupportedError } from '@ai-sdk/harness';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFxMcpRuntime } from './fx-mcp';

vi.mock('@ai-sdk/mcp', () => ({ createMCPClient: vi.fn() }));

function createClient() {
  return {
    instructions: 'Server instructions',
    listTools: vi.fn(async () => ({ tools: [] })),
    callTool: vi.fn(),
    close: vi.fn(async () => {}),
  };
}

beforeEach(() => vi.mocked(createMCPClient).mockReset());

describe('fx MCP configuration', () => {
  it.each([
    { type: undefined, expected: 'http' },
    { type: 'http', expected: 'http' },
    { type: 'streamableHttp', expected: 'http' },
    { type: 'sse', expected: 'sse' },
  ])('configures $type transport as $expected', async ({ type, expected }) => {
    const client = createClient();
    vi.mocked(createMCPClient).mockResolvedValue(
      client as unknown as MCPClient,
    );
    const controller = new AbortController();
    const runtime = await createFxMcpRuntime({
      mcpServers: {
        context7: {
          url: 'https://mcp.context7.com/mcp',
          type,
          headers: { 'x-api-key': 'test-key' },
          disabled: false,
          extraField: 'accepted',
        },
      },
      abortSignal: controller.signal,
    });
    expect(createMCPClient).toHaveBeenCalledWith({
      transport: {
        url: 'https://mcp.context7.com/mcp',
        type: expected,
        headers: { 'x-api-key': 'test-key' },
      },
      initializationOptions: { signal: controller.signal },
    });
    expect(runtime.instructions).toBe('Server instructions');
    expect(runtime.tools).toEqual([]);
    expect(client.listTools).toHaveBeenCalledWith({ params: undefined });
    await runtime.close();
    expect(client.close).toHaveBeenCalledTimes(1);
  });

  it('skips disabled entries without validating other fields', async () => {
    const runtime = await createFxMcpRuntime({
      mcpServers: { disabled: { disabled: true, headers: [], type: 'stdio' } },
    });
    expect(createMCPClient).not.toHaveBeenCalled();
    expect(runtime.tools).toEqual([]);
    await runtime.close();
  });

  it.each([
    null,
    'invalid',
    [],
    {},
    { command: 'server' },
    { url: 123 },
    { url: 'https://mcp.context7.com/mcp', type: 'stdio' },
    { url: 'https://mcp.context7.com/mcp', type: 'websocket' },
  ])('rejects unsupported server configurations: %j', async config => {
    const result = createFxMcpRuntime({ mcpServers: { context7: config } });
    await expect(result).rejects.toBeInstanceOf(
      HarnessCapabilityUnsupportedError,
    );
    await expect(result).rejects.toThrow(
      'fx MCP server context7 must use an HTTP or SSE URL. Command/stdio servers are not supported.',
    );
    expect(createMCPClient).not.toHaveBeenCalled();
  });

  it.each([
    { fields: { headers: [] }, field: 'headers' },
    {
      fields: { headers: { authorization: 123 } },
      field: 'headers.authorization',
    },
    { fields: { disabled: 'false' }, field: 'disabled' },
  ])('identifies invalid field $field', async ({ fields, field }) => {
    await expect(
      createFxMcpRuntime({
        mcpServers: {
          context7: { url: 'https://mcp.context7.com/mcp', ...fields },
        },
      }),
    ).rejects.toThrow(`Invalid fx MCP server context7 field ${field}:`);
    expect(createMCPClient).not.toHaveBeenCalled();
  });

  it.each(['configuration', 'initialization', 'catalog'] as const)(
    'closes initialized clients after a later %s failure',
    async failure => {
      const first = createClient();
      const second = createClient();
      vi.mocked(createMCPClient).mockResolvedValueOnce(
        first as unknown as MCPClient,
      );
      if (failure === 'initialization') {
        vi.mocked(createMCPClient).mockRejectedValueOnce(
          new Error('initialization failed'),
        );
      } else if (failure === 'catalog') {
        second.listTools.mockRejectedValueOnce(new Error('catalog failed'));
        vi.mocked(createMCPClient).mockResolvedValueOnce(
          second as unknown as MCPClient,
        );
      }
      await expect(
        createFxMcpRuntime({
          mcpServers: {
            first: { url: 'https://mcp.context7.com/mcp' },
            second:
              failure === 'configuration'
                ? { headers: [] }
                : { url: 'https://mcp.context7.com/mcp' },
          },
        }),
      ).rejects.toThrow();
      expect(first.close).toHaveBeenCalledTimes(1);
      expect(second.close).toHaveBeenCalledTimes(failure === 'catalog' ? 1 : 0);
    },
  );
});
