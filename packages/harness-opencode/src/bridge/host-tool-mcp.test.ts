import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type ToolHandler = (input: Record<string, unknown>) => Promise<unknown>;

const state = vi.hoisted(() => ({
  handlers: new Map<string, unknown>(),
}));

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: class {
    tool(
      name: string,
      _description: string,
      _shape: unknown,
      handler: unknown,
    ) {
      state.handlers.set(name, handler);
    }
    async connect() {}
  },
}));

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: class {},
}));

describe('host tool MCP helper', () => {
  beforeEach(() => {
    vi.resetModules();
    state.handlers.clear();
    vi.stubEnv(
      'TOOL_SCHEMAS',
      JSON.stringify([{ name: 'inspect', inputSchema: { type: 'object' } }]),
    );
    vi.stubEnv('TOOL_RELAY_URL', 'http://127.0.0.1:1/');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  async function callInspect(response: unknown) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(response)),
    );
    await import('./host-tool-mcp');
    return (state.handlers.get('inspect') as ToolHandler)({});
  }

  it('returns model-facing text and inline images as MCP content', async () => {
    await expect(
      callInspect({
        result: { status: 'ready' },
        toolResult: {
          type: 'tool-result',
          toolCallId: 'call-1',
          toolName: 'inspect',
          output: {
            type: 'content',
            value: [
              { type: 'text', text: 'marker' },
              {
                type: 'file',
                mediaType: 'image/png',
                data: { type: 'data', data: 'iVBORw==' },
              },
            ],
          },
        },
      }),
    ).resolves.toEqual({
      content: [
        { type: 'text', text: 'marker' },
        { type: 'image', data: 'iVBORw==', mimeType: 'image/png' },
      ],
      isError: false,
    });
  });

  it('keeps serializing raw results when no model output is present', async () => {
    await expect(callInspect({ result: { status: 'ready' } })).resolves.toEqual(
      {
        content: [{ type: 'text', text: '{"status":"ready"}' }],
      },
    );
  });

  it('propagates the host error flag', async () => {
    await expect(
      callInspect({ result: { error: 'failed' }, isError: true }),
    ).resolves.toEqual({
      content: [{ type: 'text', text: '{"error":"failed"}' }],
      isError: true,
    });
  });
});
