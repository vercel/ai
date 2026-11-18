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
