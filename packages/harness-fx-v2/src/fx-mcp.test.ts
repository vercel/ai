import { describe, expect, test } from 'vitest';
import {
  createFxMcpRuntime,
  executeFxMcpTool,
  type FxMcpCatalog,
} from './fx-mcp';
import { createTestMcpServer } from './test-helpers';

describe('createFxMcpRuntime', () => {
  test('uses native name disambiguation and reuses the resolved names', async () => {
    const server = await createTestMcpServer({
      handle: request =>
        request.method === 'tools/list'
          ? {
              tools: ['a.b', 'a_b', 'x'.repeat(100)].map(name => ({
                name,
                inputSchema: { type: 'object' },
              })),
            }
          : undefined,
    });
    const abortSignal = new AbortController().signal;
    const runtime = createFxMcpRuntime({
      mcpServers: { remote: { url: server.url } },
      abortSignal,
    });
    try {
      const catalog = await runtime.discover({ abortSignal });
      const names = catalog.servers[0].tools.map(tool => tool.name);
      expect(names[0]).toBe('mcp_remote_a_b');
      expect(names[1]).toBe('mcp_remote_a_b_2');
      expect(names[2]).toHaveLength(64);
      expect(
        (await runtime.createTools({ catalog })).map(tool => tool.name),
      ).toEqual(names);
    } finally {
      await runtime.close();
      await server.close();
    }
  });

  test('uses native HTTP discovery, headers, pagination and lazy connections from a recorded catalog', async () => {
    const server = await createTestMcpServer({
      handle: request =>
        request.method === 'tools/list'
          ? request.params?.cursor === 'page-2'
            ? { tools: [{ name: 'second', inputSchema: { type: 'object' } }] }
            : {
                tools: [{ name: 'lookup', inputSchema: { type: 'object' } }],
                nextCursor: 'page-2',
              }
          : undefined,
    });
    const signal = new AbortController().signal;
    const config = {
      remote: { url: server.url, headers: { authorization: 'Bearer test' } },
    };
    const runtime = createFxMcpRuntime({
      mcpServers: config,
      abortSignal: signal,
    });
    let replay: ReturnType<typeof createFxMcpRuntime> | undefined;
    try {
      const catalog = await runtime.discover({ abortSignal: signal });
      expect(catalog.servers[0].instructions).toBe('Test MCP instructions');
      expect(catalog.servers[0].tools.map(tool => tool.name)).toEqual([
        'mcp_remote_lookup',
        'mcp_remote_second',
      ]);
      expect(
        server.requests.filter(request => request.method === 'tools/list')
          .length,
      ).toBe(2);
      expect(
        server.requests.every(
          request => request.authorization === 'Bearer test',
        ),
      ).toBe(true);
      await runtime.close();
      replay = createFxMcpRuntime({ mcpServers: config, abortSignal: signal });
      const before = server.requests.length;
      const tools = await replay.createTools({
        catalog: structuredClone(catalog),
      });
      expect(server.requests.length).toBe(before);
      await invoke({ runtime: replay, catalog, abortSignal: signal });
      expect(tools.length).toBe(2);
      expect(
        server.requests.filter(request => request.method === 'tools/list')
          .length,
      ).toBe(2);
      expect(
        server.requests.filter(request => request.method === 'tools/call')
          .length,
      ).toBe(1);
    } finally {
      await runtime.close();
      await replay?.close();
      await server.close();
    }
    expect(server.deletes).toBe(2);
  });

  test('preserves large outputs and error images without writing output files', async () => {
    const text = 'large remote output '.repeat(2000);
    const server = await createTestMcpServer({
      handle: request =>
        request.method === 'tools/call'
          ? {
              content: [
                { type: 'text', text },
                { type: 'image', data: 'AAAA', mimeType: 'image/png' },
              ],
              isError: true,
            }
          : undefined,
    });
    const signal = new AbortController().signal;
    const runtime = createFxMcpRuntime({
      mcpServers: { remote: { url: server.url } },
      abortSignal: signal,
    });
    try {
      const catalog = await runtime.discover({ abortSignal: signal });
      const value = await invoke({ runtime, catalog, abortSignal: signal });
      expect(value.isError).toBe(true);
      expect(value.modelOutput).toEqual({
        type: 'content',
        value: [
          { type: 'text', text },
          { type: 'image-data', data: 'AAAA', mediaType: 'image/png' },
        ],
      });
    } finally {
      await runtime.close();
      await server.close();
    }
  });

  test('closes initialized clients on discovery failure', async () => {
    const server = await createTestMcpServer({
      handle: request => {
        if (request.method === 'tools/list')
          throw new Error('discovery failed');
      },
    });
    const signal = new AbortController().signal;
    const runtime = createFxMcpRuntime({
      mcpServers: { remote: { url: server.url } },
      abortSignal: signal,
    });
    try {
      await expect(runtime.discover({ abortSignal: signal })).rejects.toThrow(
        'discovery failed',
      );
      expect(server.deletes).toBe(1);
    } finally {
      await runtime.close();
      await server.close();
    }
  });

  test('aborts in-flight discovery', async () => {
    let started!: () => void;
    const waiting = new Promise<void>(resolve => {
      started = resolve;
    });
    const server = await createTestMcpServer({
      handle: request => {
        if (request.method === 'tools/list') {
          started();
          return new Promise(() => {});
        }
      },
    });
    const controller = new AbortController();
    const runtime = createFxMcpRuntime({
      mcpServers: { remote: { url: server.url } },
      abortSignal: controller.signal,
    });
    const pending = runtime.discover({ abortSignal: controller.signal });
    const rejected = expect(pending).rejects.toThrow();
    try {
      await waiting;
      controller.abort();
      await rejected;
    } finally {
      await runtime.close();
      await server.close();
    }
  });
});

async function invoke(options: {
  runtime: ReturnType<typeof createFxMcpRuntime>;
  catalog: FxMcpCatalog;
  abortSignal: AbortSignal;
}) {
  const { runtime, catalog, abortSignal: signal } = options;
  const tools = await runtime.createTools({ catalog });
  return executeFxMcpTool({
    tool: tools[0],
    input: { query: 'hello' },
    executionId: 'call-1',
    sessionId: 'session',
    abortSignal: signal,
  });
}
