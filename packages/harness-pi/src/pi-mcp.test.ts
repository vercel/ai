import type { HarnessV1StreamPart } from '@ai-sdk/harness';
import { createJustBashSandbox } from '@ai-sdk/sandbox-just-bash';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPi } from './pi-harness';

const MCP_TOKEN = 'mcp-test-token';

type JsonRpcRequest = {
  readonly id?: number | string;
  readonly method: string;
  readonly params?: {
    readonly name?: string;
    readonly arguments?: Readonly<Record<string, string>>;
  };
};

type McpRequestRecord = {
  readonly method: string;
  readonly path: string;
  readonly authorization: string | undefined;
  readonly toolName: string | undefined;
};

type McpTool = {
  readonly description: string;
  readonly call: (args: Readonly<Record<string, string>>) => object;
};

const MCP_SERVERS: Readonly<Record<string, Readonly<Record<string, McpTool>>>> =
  {
    '/memory': {
      echo: {
        description: 'Echo the given text back.',
        call: args => ({ echoed: args.text }),
      },
    },
    '/brand_ai': {
      brand_check: {
        description: 'Check text against the brand guidelines.',
        call: () => ({ ok: true, issues: [] }),
      },
    },
  };

type ModelRequestBody = {
  readonly tools?: ReadonlyArray<{
    readonly function: { readonly name: string };
  }>;
};

const readBody = async (request: IncomingMessage): Promise<string> => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
};

const listen = async (server: Server): Promise<string> => {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
};

const close = (server: Server): Promise<void> =>
  new Promise(resolve => server.close(() => resolve()));

const createMcpServer = () => {
  const requests: McpRequestRecord[] = [];
  const sessionIds = new Map<string, string>();
  const deletedSessionIds: string[] = [];

  const respond = (
    response: ServerResponse,
    sessionId: string,
    id: JsonRpcRequest['id'],
    result: object,
  ) => {
    response
      .writeHead(200, {
        'content-type': 'application/json',
        'mcp-session-id': sessionId,
      })
      .end(JSON.stringify({ jsonrpc: '2.0', id, result }));
  };

  const server = createServer(async (request, response) => {
    const requestPath = request.url ?? '';
    const body = await readBody(request);
    const message: JsonRpcRequest | undefined =
      request.method === 'POST' ? JSON.parse(body) : undefined;
    requests.push({
      method: message?.method ?? request.method ?? '',
      path: requestPath,
      authorization: request.headers.authorization,
      toolName: message?.params?.name,
    });

    const tools = MCP_SERVERS[requestPath];
    if (request.headers.authorization !== `Bearer ${MCP_TOKEN}`) {
      response.writeHead(401).end();
      return;
    }
    if (tools == null) {
      response.writeHead(404).end();
      return;
    }
    if (request.method === 'DELETE') {
      deletedSessionIds.push(String(request.headers['mcp-session-id']));
      response.writeHead(200).end();
      return;
    }
    if (message == null || message.id == null) {
      response.writeHead(202).end();
      return;
    }

    const sessionId = `${requestPath.slice(1)}-session`;
    if (message.method === 'initialize') {
      sessionIds.set(requestPath, sessionId);
      respond(response, sessionId, message.id, {
        protocolVersion: '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: requestPath.slice(1), version: '1.0.0' },
      });
      return;
    }
    if (message.method === 'tools/list') {
      respond(response, sessionId, message.id, {
        tools: Object.entries(tools).map(([name, tool]) => ({
          name,
          description: tool.description,
          inputSchema: {
            type: 'object',
            properties: { text: { type: 'string' }, query: { type: 'string' } },
          },
        })),
      });
      return;
    }
    if (message.method === 'tools/call') {
      const tool = tools[message.params?.name ?? ''];
      const events = [
        {
          jsonrpc: '2.0',
          method: 'notifications/message',
          params: { level: 'info', data: 'tool called' },
        },
        {
          jsonrpc: '2.0',
          id: message.id,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  tool?.call(message.params?.arguments ?? {}),
                ),
              },
            ],
          },
        },
      ];
      response
        .writeHead(200, {
          'content-type': 'text/event-stream',
          'mcp-session-id': sessionId,
        })
        .end(
          events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''),
        );
      return;
    }
    response.writeHead(200, { 'content-type': 'application/json' }).end(
      JSON.stringify({
        jsonrpc: '2.0',
        id: message.id,
        error: { code: -32601, message: 'Method not found' },
      }),
    );
  });

  return { server, requests, sessionIds, deletedSessionIds };
};

const toolCallChunks = (name: string, args: object): object[] => [
  {
    choices: [
      {
        index: 0,
        delta: {
          role: 'assistant',
          tool_calls: [
            {
              index: 0,
              id: `call-${name}`,
              type: 'function',
              function: { name, arguments: JSON.stringify(args) },
            },
          ],
        },
      },
    ],
  },
  { choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] },
];

const MODEL_SCRIPT: ReadonlyArray<ReadonlyArray<object>> = [
  toolCallChunks('tool_search', { query: 'brand check' }),
  toolCallChunks('mcp__brand_ai__brand_check', { query: 'hello' }),
  [
    { choices: [{ index: 0, delta: { role: 'assistant', content: 'done' } }] },
    { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
  ],
];

const createModelServer = () => {
  const requests: ModelRequestBody[] = [];
  const server = createServer(async (request, response) => {
    const body: ModelRequestBody = JSON.parse(await readBody(request));
    const chunks = MODEL_SCRIPT[requests.length] ?? MODEL_SCRIPT.at(-1)!;
    requests.push(body);
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    for (const chunk of chunks) {
      response.write(
        `data: ${JSON.stringify({ id: 'chatcmpl-test', model: 'fake-model', ...chunk })}\n\n`,
      );
    }
    response.end('data: [DONE]\n\n');
  });
  return { server, requests };
};

const declaredToolNames = (body: ModelRequestBody | undefined): string[] =>
  (body?.tools ?? []).map(tool => tool.function.name);

describe("Pi's native MCP over streamable HTTP", () => {
  const mcp = createMcpServer();
  const model = createModelServer();
  const agentDir = mkdtempSync(path.join(tmpdir(), 'pi-mcp-agent-'));
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  let mcpUrl = '';
  let modelUrl = '';

  beforeAll(async () => {
    process.env.PI_CODING_AGENT_DIR = agentDir;
    mcpUrl = await listen(mcp.server);
    modelUrl = await listen(model.server);
  });

  afterAll(async () => {
    if (previousAgentDir == null) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    await Promise.all([close(mcp.server), close(model.server)]);
    rmSync(agentDir, { recursive: true, force: true });
  });

  it('declares direct tools, loads deferred tools through tool_search and closes connections on destroy', async () => {
    const sessionWorkDir = '/sandbox/workspace';
    const sandboxSession = await createJustBashSandbox({
      cwd: sessionWorkDir,
    }).createSession();
    const headers = { Authorization: `Bearer ${MCP_TOKEN}` };
    const harness = createPi({
      auth: {},
      providers: {
        fake: {
          baseUrl: `${modelUrl}/v1`,
          api: 'openai-completions',
          apiKey: 'test-key',
          models: [
            {
              id: 'fake-model',
              name: 'Fake Model',
              reasoning: false,
              input: ['text'],
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
              contextWindow: 128_000,
              maxTokens: 4_096,
            },
          ],
        },
      },
      mcpServers: {
        memory: { url: `${mcpUrl}/memory`, headers },
        brand_ai: { url: `${mcpUrl}/brand_ai`, headers, exposure: 'deferred' },
      },
    });

    const session = await harness.doStart({
      sessionId: 'session-native-mcp',
      sandboxSession,
      sessionWorkDir,
    });
    const parts: HarnessV1StreamPart[] = [];
    try {
      const control = await session.doPromptTurn({
        prompt: 'Run a brand check.',
        model: 'fake/fake-model',
        tools: [],
        skills: [],
        emit: part => {
          parts.push(part);
        },
      });
      await control.done;
    } finally {
      await session.doDestroy();
    }

    expect(declaredToolNames(model.requests[0])).toEqual(
      expect.arrayContaining(['mcp__memory__echo', 'tool_search']),
    );
    expect(declaredToolNames(model.requests[0])).not.toContain(
      'mcp__brand_ai__brand_check',
    );
    expect(declaredToolNames(model.requests[1])).toContain(
      'mcp__brand_ai__brand_check',
    );

    const toolCalls = parts.filter(part => part.type === 'tool-call');
    expect(toolCalls).toEqual([
      expect.objectContaining({
        toolName: 'tool_search',
        providerExecuted: true,
        dynamic: true,
      }),
      expect.objectContaining({
        toolName: 'mcp__brand_ai__brand_check',
        providerExecuted: true,
        dynamic: true,
      }),
    ]);
    expect(parts).toContainEqual(
      expect.objectContaining({
        type: 'tool-result',
        toolName: 'mcp__brand_ai__brand_check',
        result: { ok: true, issues: [] },
      }),
    );
    expect(parts.at(-1)?.type).toBe('finish');

    expect(mcp.requests.length).toBeGreaterThan(0);
    for (const request of mcp.requests) {
      expect(request.authorization).toBe(`Bearer ${MCP_TOKEN}`);
      expect(request.path).not.toMatch(/well-known|oauth/);
    }
    expect(mcp.requests).toContainEqual({
      method: 'tools/call',
      path: '/brand_ai',
      authorization: `Bearer ${MCP_TOKEN}`,
      toolName: 'brand_check',
    });

    expect(mcp.deletedSessionIds.sort()).toEqual(
      [...mcp.sessionIds.values()].sort(),
    );
    expect(mcp.sessionIds.size).toBe(2);
    expect(
      readdirSync(agentDir).filter(name => name.startsWith('mcp')),
    ).toEqual([]);
  });
});
