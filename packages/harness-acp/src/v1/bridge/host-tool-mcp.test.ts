import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { createHostToolMCPServer } from './host-tool-mcp-server';

const mocks = vi.hoisted(() => ({
  createServer: vi.fn(),
  postRelay: vi.fn(),
  readFile: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({ readFile: mocks.readFile }));
vi.mock('./host-tool-mcp-server', () => ({
  createHostToolMCPServer: mocks.createServer,
}));
vi.mock('./host-tool-relay-client', () => ({
  postHostToolRelay: mocks.postRelay,
}));
vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: class {},
}));

describe('host tool MCP stdio entry', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv('AI_SDK_ACP_HOST_TOOLS_FILE', '/tools.json');
    vi.stubEnv('AI_SDK_ACP_HOST_TOOL_RELAY_URL', 'http://localhost/invoke');
    vi.stubEnv('AI_SDK_ACP_HOST_TOOL_RELAY_CREDENTIAL', 'test-credential');
    mocks.readFile.mockResolvedValue(
      '[{"name":"inspect","inputSchema":{"type":"object"}}]',
    );
    mocks.createServer.mockReturnValue({
      server: { connect: vi.fn(async () => {}), close: vi.fn(async () => {}) },
      updateCatalog: vi.fn(),
    });
    mocks.postRelay.mockResolvedValue({
      ok: true,
      status: 200,
      value: { closed: true },
    });
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each(
    [
      undefined,
      {
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
    ].map(toolResult => ({ toolResult })),
  )(
    'preserves optional model output in relay responses: %j',
    async ({ toolResult }) => {
      await import('./host-tool-mcp');
      const options = mocks.createServer.mock.calls[0]![0] as Parameters<
        typeof createHostToolMCPServer
      >[0];
      const value = {
        output: { status: 'ready' },
        correlationToken: 'token',
        ...(toolResult == null ? {} : { toolResult }),
      };
      mocks.postRelay.mockResolvedValue({ ok: true, status: 200, value });
      await expect(
        options.invoke({ toolName: 'inspect', input: {}, catalogRevision: 1 }),
      ).resolves.toEqual(value);
    },
  );

  it.each([
    null,
    {},
    { type: 'wrong' },
    {
      type: 'tool-result',
      toolCallId: 'call',
      toolName: 'inspect',
      output: [],
    },
  ])('rejects malformed model output: %j', async toolResult => {
    await import('./host-tool-mcp');
    const options = mocks.createServer.mock.calls[0]![0] as Parameters<
      typeof createHostToolMCPServer
    >[0];
    mocks.postRelay.mockResolvedValue({
      ok: true,
      status: 200,
      value: { output: {}, correlationToken: 'token', toolResult },
    });
    await expect(
      options.invoke({ toolName: 'inspect', input: {}, catalogRevision: 1 }),
    ).rejects.toThrow('Invalid host tool relay response.');
  });
});
