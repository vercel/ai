import { afterEach, expect, it, vi } from 'vitest';
import { createMCPClient, type MCPClient } from './mcp-client';
import type { JSONRPCRequest } from './json-rpc-message';
import type { MCPTransport } from './mcp-transport';
import { ElicitationRequestSchema, type ElicitResult } from './types';

const elicitation = {
  method: 'elicitation/create',
  params: { message: 'Proceed?', requestedSchema: { type: 'object' } },
};
const complete = {
  resultType: 'complete',
  content: [],
  contents: [],
  messages: [],
};
let client: MCPClient;

afterEach(async () => {
  await client?.close();
  vi.useRealTimers();
});

async function setup(results: Record<string, unknown>[]) {
  const requests: JSONRPCRequest[] = [];
  const transport: MCPTransport = {
    supportsProtocolVersionDiscovery: true,
    async start() {},
    async close() {
      transport.onclose?.();
    },
    async send(message) {
      if (!('method' in message) || !('id' in message)) return;
      const discovery = message.method === 'server/discover';
      if (!discovery) requests.push(message);
      transport.onmessage?.({
        jsonrpc: '2.0',
        id: message.id,
        result: discovery
          ? {
              resultType: 'complete',
              supportedVersions: ['2026-07-28'],
              capabilities: { tools: {}, resources: {}, prompts: {} },
            }
          : results[Math.min(requests.length - 1, results.length - 1)],
      });
    },
  };
  client = await createMCPClient({
    transport,
    capabilities: { elicitation: {} },
  });
  return requests;
}

it.each(['tool', 'resource', 'prompt'] as const)(
  'continues a %s request with fresh IDs and only the latest answers/state',
  async kind => {
    const requests = await setup([
      {
        resultType: 'input_required',
        inputRequests: { confirm: elicitation },
        requestState: ' opaque state\n',
      },
      { resultType: 'input_required', inputRequests: { again: elicitation } },
      complete,
    ]);
    const handler = vi
      .fn()
      .mockResolvedValueOnce({ action: 'accept', content: { ok: true } })
      .mockResolvedValueOnce({ action: 'decline' });
    client.onElicitationRequest(ElicitationRequestSchema, handler);
    await (kind === 'tool'
      ? client.callTool({ name: 'deploy', arguments: { target: 'demo' } })
      : kind === 'resource'
        ? client.readResource({ uri: 'file:///demo' })
        : client.experimental_getPrompt({
            name: 'deploy',
            arguments: { target: 'demo' },
          }));

    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenCalledWith(elicitation);
    expect(new Set(requests.map(request => request.id)).size).toBe(3);
    expect(requests[1]).toMatchObject({
      method: requests[0].method,
      params: {
        ...requests[0].params,
        inputResponses: {
          confirm: { action: 'accept', content: { ok: true } },
        },
        requestState: ' opaque state\n',
      },
    });
    expect(requests[2].params).toEqual({
      ...requests[0].params,
      inputResponses: { again: { action: 'decline' } },
    });
  },
);

it.each([
  [{ inputRequests: { confirm: elicitation } }, /onElicitationRequest/],
  [
    { inputRequests: { sample: { method: 'sampling/createMessage' } } },
    /Unsupported input request/,
  ],
  [
    { inputRequests: { confirm: { ...elicitation, params: { mode: 'url' } } } },
    /Unsupported input request/,
  ],
  [{ requestState: 42 }, /Failed to process/],
  [{}, /Failed to process/],
] as const)(
  'rejects unsupported or invalid input requirements: %j',
  async (result, message) => {
    const requests = await setup([{ resultType: 'input_required', ...result }]);
    await expect(client.callTool({ name: 'deploy' })).rejects.toThrow(message);
    expect(requests).toHaveLength(1);
  },
);

it('paces state-only retries and stops after ten rounds', async () => {
  vi.useFakeTimers();
  const requests = await setup([
    { resultType: 'input_required', requestState: '' },
  ]);
  const rejected = expect(client.callTool({ name: 'deploy' })).rejects.toThrow(
    '10 rounds',
  );
  await vi.advanceTimersByTimeAsync(249);
  expect(requests).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(2251);
  await rejected;
  expect(requests).toHaveLength(11);
  expect(requests[1].params).toEqual({
    ...requests[0].params,
    requestState: '',
  });
});

it.each(['abort', 'close', 'timeout'] as const)(
  'stops while awaiting input on %s',
  async stop => {
    vi.useFakeTimers();
    const requests = await setup([
      { resultType: 'input_required', inputRequests: { confirm: elicitation } },
    ]);
    let finish!: (answer: ElicitResult) => void;
    let entered!: () => void;
    const started = new Promise<void>(resolve => {
      entered = resolve;
    });
    client.onElicitationRequest(
      ElicitationRequestSchema,
      () =>
        new Promise(resolve => {
          finish = resolve;
          entered();
        }),
    );
    const controller = new AbortController();
    const rejected = expect(
      client.callTool({
        name: 'deploy',
        options: { signal: controller.signal, maxTotalTimeout: 100 },
      }),
    ).rejects.toThrow(/aborted|closed|timed out/);
    await started;
    if (stop === 'abort') controller.abort();
    else if (stop === 'close') await client.close();
    else await vi.advanceTimersByTimeAsync(100);
    await rejected;
    finish({ action: 'accept', content: { ok: true } });
    await vi.runAllTimersAsync();
    expect(requests).toHaveLength(1);
  },
);

it('handles url-mode elicitation in the auto-fulfill loop when url capability is declared', async () => {
  const urlElicitation = {
    method: 'elicitation/create',
    params: {
      mode: 'url',
      message: 'Sign in to the upstream service',
      url: 'https://example.com/oauth/authorize',
      elicitationId: 'elicit-123',
    },
  };
  const requests: JSONRPCRequest[] = [];
  const transport: MCPTransport = {
    supportsProtocolVersionDiscovery: true,
    async start() {},
    async close() {
      transport.onclose?.();
    },
    async send(message) {
      if (!('method' in message) || !('id' in message)) return;
      const discovery = message.method === 'server/discover';
      if (!discovery) requests.push(message);
      transport.onmessage?.({
        jsonrpc: '2.0',
        id: message.id,
        result: discovery
          ? {
              resultType: 'complete',
              supportedVersions: ['2026-07-28'],
              capabilities: { tools: {} },
            }
          : requests.length === 1
            ? {
                resultType: 'input_required',
                inputRequests: { signin: urlElicitation },
                requestState: 'oauth-state-1',
              }
            : complete,
      });
    },
  };

  client = await createMCPClient({
    transport,
    capabilities: { elicitation: { form: {}, url: {} } },
  });

  const handler = vi.fn().mockResolvedValueOnce({ action: 'accept' });
  client.onElicitationRequest(ElicitationRequestSchema, handler);

  await client.callTool({ name: 'connect' });

  expect(handler).toHaveBeenCalledTimes(1);
  expect(handler).toHaveBeenCalledWith(urlElicitation);
  expect(requests).toHaveLength(2);
  expect(requests[1].params).toMatchObject({
    name: 'connect',
    arguments: {},
    inputResponses: { signin: { action: 'accept' } },
    requestState: 'oauth-state-1',
  });
});

it('returns input_required to caller when allowInputRequired is true and retries with inputResponses and requestState', async () => {
  const urlElicitation = {
    method: 'elicitation/create',
    params: {
      mode: 'url',
      message: 'Sign in to the upstream service',
      url: 'https://example.com/oauth/authorize',
      elicitationId: 'elicit-456',
    },
  };
  const requests = await setup([
    {
      resultType: 'input_required',
      inputRequests: { signin: urlElicitation },
      requestState: 'state-token-xyz',
    },
    complete,
  ]);

  const handler = vi.fn();
  client.onElicitationRequest(ElicitationRequestSchema, handler);

  const firstResult = await client.callTool({
    name: 'connect',
    arguments: { workspace: 'prod' },
    options: { allowInputRequired: true },
  });

  expect(handler).not.toHaveBeenCalled();
  expect(firstResult).toEqual({
    resultType: 'input_required',
    inputRequests: { signin: urlElicitation },
    requestState: 'state-token-xyz',
  });

  const secondResult = await client.callTool({
    name: 'connect',
    arguments: { workspace: 'prod' },
    inputResponses: { signin: { action: 'accept' } },
    requestState: 'state-token-xyz',
    options: { allowInputRequired: true },
  });

  expect(secondResult).toMatchObject({ resultType: 'complete', content: [] });
  expect(requests).toHaveLength(2);
  expect(requests[1].params).toMatchObject({
    name: 'connect',
    arguments: { workspace: 'prod' },
    inputResponses: { signin: { action: 'accept' } },
    requestState: 'state-token-xyz',
  });
});

it.each(['tool', 'resource', 'prompt'] as const)(
  'supports client-level inputRequired.autoFulfill: false for %s requests',
  async kind => {
    const requests: JSONRPCRequest[] = [];
    const results = [
      {
        resultType: 'input_required',
        inputRequests: { confirm: elicitation },
        requestState: 'manual-state',
      },
      complete,
    ];
    const transport: MCPTransport = {
      supportsProtocolVersionDiscovery: true,
      async start() {},
      async close() {
        transport.onclose?.();
      },
      async send(message) {
        if (!('method' in message) || !('id' in message)) return;
        const discovery = message.method === 'server/discover';
        if (!discovery) requests.push(message);
        transport.onmessage?.({
          jsonrpc: '2.0',
          id: message.id,
          result: discovery
            ? {
                resultType: 'complete',
                supportedVersions: ['2026-07-28'],
                capabilities: { tools: {}, resources: {}, prompts: {} },
              }
            : results[Math.min(requests.length - 1, results.length - 1)],
        });
      },
    };

    client = await createMCPClient({
      transport,
      capabilities: { elicitation: { form: {} } },
      inputRequired: { autoFulfill: false },
    });

    const first =
      kind === 'tool'
        ? await client.callTool({ name: 'deploy' })
        : kind === 'resource'
          ? await client.readResource({ uri: 'file:///demo' })
          : await client.getPrompt({ name: 'deploy' });

    expect(first).toEqual({
      resultType: 'input_required',
      inputRequests: { confirm: elicitation },
      requestState: 'manual-state',
    });

    const resumeArgs = {
      inputResponses: { confirm: { action: 'accept' as const } },
      requestState: 'manual-state',
    };
    const second =
      kind === 'tool'
        ? await client.callTool({ name: 'deploy', ...resumeArgs })
        : kind === 'resource'
          ? await client.readResource({ uri: 'file:///demo', ...resumeArgs })
          : await client.getPrompt({ name: 'deploy', ...resumeArgs });

    expect(second).toMatchObject({ resultType: 'complete' });
    expect(requests[1].params).toMatchObject(resumeArgs);
  },
);
