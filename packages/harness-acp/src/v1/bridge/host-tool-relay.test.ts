import { describe, expect, it, vi } from 'vitest';
import {
  catalogFingerprint,
  startHostToolRelay,
  type HostToolRelayTurn,
} from './host-tool-relay';
import { createHostToolRelayAuthorization } from './host-tool-relay-authorization';

describe('startHostToolRelay', () => {
  it('refuses a stolen bearer without an ACP call and executes only a matching one-use call', async () => {
    const relay = await createRelay({
      tools: [{ name: 'weather', inputSchema: { type: 'object' } }],
    });
    const authorization = createHostToolRelayAuthorization({
      serverName: 'ai-sdk-harness-tools',
      toolNames: ['weather'],
      ttlMs: 20,
    });
    const turn: HostToolRelayTurn = {
      waitForToolCallAuthorization: authorization.waitForToolCallAuthorization,
      emitToolCall: vi.fn(),
      emitToolResult: vi.fn(),
      requestToolResult: vi.fn(async () => ({ output: { celsius: 19 } })),
      registerCorrelationInvocation: vi.fn(),
      removeCorrelationInvocation: vi.fn(),
    };
    relay.bindTurn({ turn });
    try {
      await expect(
        invokeResponse({
          relay,
          requestId: 'stolen-credential',
          toolName: 'weather',
          input: { city: 'Lima' },
          catalogRevision: 1,
        }),
      ).resolves.toMatchObject({
        status: 401,
        value: { error: 'Unauthorized host tool relay request.' },
      });
      expect(turn.emitToolCall).not.toHaveBeenCalled();
      expect(turn.registerCorrelationInvocation).not.toHaveBeenCalled();
      expect(turn.requestToolResult).not.toHaveBeenCalled();

      authorization.observeUpdate({
        update: {
          sessionUpdate: 'tool_call',
          toolCallId: 'model-call',
          title: 'Weather',
          name: 'mcp__ai-sdk-harness-tools__weather',
          rawInput: { city: 'Lima' },
          status: 'in_progress',
        },
      });
      await expect(
        invoke({
          relay,
          requestId: 'real-call',
          toolName: 'weather',
          input: { city: 'Lima' },
          catalogRevision: 1,
        }),
      ).resolves.toMatchObject({ output: { celsius: 19 } });
      expect(turn.emitToolCall).toHaveBeenCalledTimes(1);
      expect(turn.requestToolResult).toHaveBeenCalledTimes(1);

      await expect(
        invokeResponse({
          relay,
          requestId: 'replay',
          toolName: 'weather',
          input: { city: 'Lima' },
          catalogRevision: 1,
        }),
      ).resolves.toMatchObject({ status: 401 });
      expect(turn.emitToolCall).toHaveBeenCalledTimes(1);
      expect(turn.registerCorrelationInvocation).toHaveBeenCalledTimes(1);
    } finally {
      authorization.close();
      relay.unbindTurn({ turn });
      await relay.close();
    }
  });

  it('emits one authoritative call, waits for the caller, and returns the result', async () => {
    let resolveResult!: (result: {
      output: unknown;
      isError?: boolean;
    }) => void;
    const pendingResult = new Promise<{
      output: unknown;
      isError?: boolean;
    }>(resolve => {
      resolveResult = resolve;
    });
    const emitToolCall = vi.fn();
    const emitToolResult = vi.fn();
    const registerCorrelationInvocation = vi.fn();
    const turn: HostToolRelayTurn = {
      waitForToolCallAuthorization: async () => true,
      emitToolCall,
      emitToolResult,
      requestToolResult: () => pendingResult,
      registerCorrelationInvocation,
      removeCorrelationInvocation: vi.fn(),
    };
    const relay = await createRelay({
      tools: [{ name: 'weather', inputSchema: { type: 'object' } }],
    });
    relay.bindTurn({ turn });

    const responsePromise = invoke({
      relay,
      requestId: 'host-call-1',
      toolName: 'weather',
      input: { city: 'Lima' },
      catalogRevision: 1,
    });
    await vi.waitFor(() => {
      expect(emitToolCall).toHaveBeenCalledTimes(1);
    });
    expect(emitToolCall).toHaveBeenCalledWith({
      toolCallId: 'host-call-1',
      toolName: 'weather',
      input: { city: 'Lima' },
    });
    expect(emitToolResult).not.toHaveBeenCalled();
    expect(registerCorrelationInvocation).toHaveBeenCalledWith({
      token: expect.stringMatching(/^[a-f0-9]{64}$/),
      serverName: 'ai-sdk-harness-tools',
      toolName: 'weather',
      input: { city: 'Lima' },
      order: 1,
    });

    resolveResult({ output: { celsius: 19 } });
    const response = await responsePromise;
    expect(response).toMatchObject({
      output: { celsius: 19 },
      correlationToken: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(emitToolResult).toHaveBeenCalledWith({
      toolCallId: 'host-call-1',
      toolName: 'weather',
      output: { celsius: 19 },
    });

    relay.unbindTurn({ turn });
    await relay.close();
  });

  it('updates, acknowledges, removes, and closes catalog revisions', async () => {
    const initialTools = [
      {
        name: 'first',
        description: 'Initial tool.',
        inputSchema: {
          type: 'object',
          properties: {
            nested: {
              type: 'object',
              properties: {
                value: { type: 'string', minLength: 1 },
              },
            },
          },
        },
      },
    ] as const;
    const relay = await createRelay({ tools: initialTools });

    expect(
      relay.updateCatalog({
        tools: [
          {
            inputSchema: {
              properties: {
                nested: {
                  properties: {
                    value: { minLength: 1, type: 'string' },
                  },
                  type: 'object',
                },
              },
              type: 'object',
            },
            description: 'Initial tool.',
            name: 'first',
          },
        ],
      }),
    ).toEqual({ changed: false, revision: 1 });

    expect(
      relay.updateCatalog({
        tools: [
          {
            name: 'second',
            description: 'Replacement tool.',
            inputSchema: { type: 'object' },
          },
        ],
      }),
    ).toEqual({ changed: true, revision: 2 });
    await expect(
      postRelay({
        relay,
        path: '/catalog/next',
        body: { afterRevision: 1 },
      }),
    ).resolves.toMatchObject({
      revision: 2,
      tools: [{ name: 'second', description: 'Replacement tool.' }],
    });
    await expect(
      relay.waitForCatalogRefresh({ revision: 2, timeoutMs: 5 }),
    ).resolves.toBe(false);
    await expect(
      postRelay({
        relay,
        path: '/catalog/seen',
        body: { revision: 2 },
      }),
    ).resolves.toEqual({ acknowledged: true });
    await expect(
      relay.waitForCatalogRefresh({ revision: 2, timeoutMs: 5 }),
    ).resolves.toBe(true);

    expect(relay.updateCatalog({ tools: [] })).toEqual({
      changed: true,
      revision: 3,
    });
    await expect(
      postRelay({
        relay,
        path: '/catalog/next',
        body: { afterRevision: 2 },
      }),
    ).resolves.toEqual({ revision: 3, tools: [] });

    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    try {
      const heldPoll = postRelay({
        relay,
        path: '/catalog/next',
        body: { afterRevision: 3 },
      });
      await vi.waitFor(() => {
        expect(setTimeoutSpy).toHaveBeenCalledWith(
          expect.any(Function),
          20_000,
        );
      });
      await relay.close();
      await expect(heldPoll).resolves.toEqual({ closed: true, revision: 3 });
    } finally {
      setTimeoutSpy.mockRestore();
      await relay.close();
    }
  });

  it('rejects stale and removed calls without consuming invocation order', async () => {
    const turn: HostToolRelayTurn = {
      waitForToolCallAuthorization: async () => true,
      emitToolCall: vi.fn(),
      emitToolResult: vi.fn(),
      requestToolResult: async () => ({
        output: { accepted: true },
      }),
      registerCorrelationInvocation: vi.fn(),
      removeCorrelationInvocation: vi.fn(),
    };
    const relay = await createRelay({
      tools: [{ name: 'known', inputSchema: { type: 'object' } }],
    });
    relay.bindTurn({ turn });

    await expect(
      invoke({
        relay,
        requestId: 'first',
        toolName: 'known',
        input: {},
        catalogRevision: 1,
      }),
    ).resolves.toMatchObject({ output: { accepted: true } });

    relay.updateCatalog({
      tools: [{ name: 'replacement', inputSchema: { type: 'object' } }],
    });
    await expect(
      invokeResponse({
        relay,
        requestId: 'stale',
        toolName: 'known',
        input: {},
        catalogRevision: 1,
      }),
    ).resolves.toMatchObject({ status: 409 });
    await expect(
      invokeResponse({
        relay,
        requestId: 'removed',
        toolName: 'known',
        input: {},
        catalogRevision: 2,
      }),
    ).resolves.toMatchObject({ status: 404 });
    await expect(
      invoke({
        relay,
        requestId: 'second',
        toolName: 'replacement',
        input: {},
        catalogRevision: 2,
      }),
    ).resolves.toMatchObject({ output: { accepted: true } });

    expect(turn.registerCorrelationInvocation).toHaveBeenCalledTimes(2);
    expect(turn.registerCorrelationInvocation).toHaveBeenLastCalledWith(
      expect.objectContaining({ order: 2, toolName: 'replacement' }),
    );

    relay.unbindTurn({ turn });
    await relay.close();
  });

  it('returns caller failures and rejects unauthenticated calls', async () => {
    const turn: HostToolRelayTurn = {
      waitForToolCallAuthorization: async () => true,
      emitToolCall: vi.fn(),
      emitToolResult: vi.fn(),
      requestToolResult: async () => ({
        output: { message: 'provider failed' },
        isError: true,
      }),
      registerCorrelationInvocation: vi.fn(),
      removeCorrelationInvocation: vi.fn(),
    };
    const relay = await createRelay({
      tools: [{ name: 'known', inputSchema: { type: 'object' } }],
    });
    relay.bindTurn({ turn });

    await expect(
      invoke({
        relay,
        requestId: 'host-call-2',
        toolName: 'known',
        input: {},
        catalogRevision: 1,
      }),
    ).resolves.toMatchObject({
      output: { message: 'provider failed' },
      isError: true,
      correlationToken: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(turn.emitToolResult).toHaveBeenCalledWith({
      toolCallId: 'host-call-2',
      toolName: 'known',
      output: { message: 'provider failed' },
      isError: true,
    });

    const unauthorized = await fetch(relay.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        requestId: 'unauthorized',
        toolName: 'known',
        input: {},
        catalogRevision: 1,
      }),
    });
    expect(unauthorized.status).toBe(401);

    relay.unbindTurn({ turn });
    await relay.close();
  });
});

describe('catalogFingerprint', () => {
  it('sorts object keys while preserving array order', () => {
    const first = catalogFingerprint({
      tools: [
        {
          name: 'schema',
          inputSchema: {
            type: 'object',
            required: ['first', 'second'],
            properties: {
              second: { type: 'number' },
              first: { type: 'string' },
            },
          },
        },
      ],
    });
    const reorderedKeys = catalogFingerprint({
      tools: [
        {
          inputSchema: {
            properties: {
              first: { type: 'string' },
              second: { type: 'number' },
            },
            required: ['first', 'second'],
            type: 'object',
          },
          name: 'schema',
        },
      ],
    });
    const reorderedArray = catalogFingerprint({
      tools: [
        {
          name: 'schema',
          inputSchema: {
            type: 'object',
            required: ['second', 'first'],
            properties: {
              first: { type: 'string' },
              second: { type: 'number' },
            },
          },
        },
      ],
    });

    expect(reorderedKeys).toBe(first);
    expect(reorderedArray).not.toBe(first);
  });
});

async function createRelay({
  tools,
}: {
  tools: Parameters<typeof startHostToolRelay>[0]['tools'];
}) {
  return startHostToolRelay({
    tools,
    serverName: 'ai-sdk-harness-tools',
  });
}

async function invoke({
  relay,
  requestId,
  toolName,
  input,
  catalogRevision,
}: {
  relay: Awaited<ReturnType<typeof startHostToolRelay>>;
  requestId: string;
  toolName: string;
  input: Readonly<Record<string, unknown>>;
  catalogRevision: number;
}): Promise<Record<string, unknown>> {
  const response = await invokeResponse({
    relay,
    requestId,
    toolName,
    input,
    catalogRevision,
  });
  expect(response.status).toBe(200);
  return response.value as Record<string, unknown>;
}

async function invokeResponse({
  relay,
  requestId,
  toolName,
  input,
  catalogRevision,
}: {
  relay: Awaited<ReturnType<typeof startHostToolRelay>>;
  requestId: string;
  toolName: string;
  input: Readonly<Record<string, unknown>>;
  catalogRevision: number;
}): Promise<{ status: number; value: unknown }> {
  const response = await fetch(relay.url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${relay.credential}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      requestId,
      toolName,
      input,
      catalogRevision,
    }),
  });
  return { status: response.status, value: await response.json() };
}

async function postRelay({
  relay,
  path,
  body,
}: {
  relay: Awaited<ReturnType<typeof startHostToolRelay>>;
  path: string;
  body: Readonly<Record<string, unknown>>;
}): Promise<unknown> {
  const response = await fetch(new URL(path, relay.url), {
    method: 'POST',
    headers: {
      authorization: `Bearer ${relay.credential}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  expect(response.status).toBe(200);
  return response.json();
}
