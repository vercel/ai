import { describe, expect, it, vi } from 'vitest';
import { createHostToolCallResolver } from './host-tool-call-resolver';

function createTurn() {
  const emitted: Array<Record<string, unknown>> = [];
  const pending = new Map<string, (result: { output: unknown }) => void>();
  const abortController = new AbortController();
  return {
    emitted,
    abortController,
    respond({ requestId, output }: { requestId: string; output: unknown }) {
      pending.get(requestId)?.({ output });
      pending.delete(requestId);
    },
    turn: {
      emit: (event: Record<string, unknown> & { type: string }) => {
        emitted.push(event);
      },
      requestToolResult: vi.fn(
        (input: string | { toolCallId: string }) =>
          new Promise<{ output: unknown }>(resolve => {
            pending.set(
              typeof input === 'string' ? input : input.toolCallId,
              resolve,
            );
          }),
      ),
      abortSignal: abortController.signal,
    },
  };
}

function lastRequestId({
  emitted,
}: {
  emitted: Array<Record<string, unknown>>;
}): string {
  const requestId = emitted.at(-1)?.requestId;
  if (typeof requestId !== 'string') throw new Error('Missing request.');
  return requestId;
}

describe('createHostToolCallResolver', () => {
  it('asks the host to resolve the merged tool call snapshot', async () => {
    const fake = createTurn();
    const resolver = createHostToolCallResolver({
      turn: fake.turn,
      serverName: 'ai-sdk-harness-tools',
      toolNames: ['get_weather'],
    });

    const first = resolver.resolveUpdate({
      update: { toolCallId: 'call-1', title: 'MCP: tool', rawInput: {} },
    });
    fake.respond({
      requestId: lastRequestId(fake),
      output: { hostToolCall: null },
    });
    expect(await first).toBeUndefined();

    const second = resolver.resolveUpdate({
      update: { toolCallId: 'call-1', status: 'pending' },
    });
    expect(fake.emitted.at(-1)).toMatchInlineSnapshot(
      { requestId: expect.any(String) },
      `
      {
        "requestId": Any<String>,
        "serverName": "ai-sdk-harness-tools",
        "toolCall": {
          "rawInput": {},
          "status": "pending",
          "title": "MCP: tool",
          "toolCallId": "call-1",
        },
        "toolNames": [
          "get_weather",
        ],
        "type": "acp-host-tool-call-resolution-request",
      }
    `,
    );
    fake.respond({
      requestId: lastRequestId(fake),
      output: {
        hostToolCall: { toolName: 'get_weather', input: { city: 'Austin' } },
      },
    });
    expect(await second).toMatchInlineSnapshot(`
      {
        "input": {
          "city": "Austin",
        },
        "toolName": "get_weather",
      }
    `);
    expect(await resolver.getResolution({ toolCallId: 'call-1' })).toEqual(
      await second,
    );
    resolver.close();
  });

  it('waits for an in-flight resolution before returning it', async () => {
    const fake = createTurn();
    const resolver = createHostToolCallResolver({
      turn: fake.turn,
      serverName: 'ai-sdk-harness-tools',
      toolNames: ['get_weather'],
    });
    void resolver.resolveUpdate({
      update: { toolCallId: 'call-1', title: 'Tool' },
    });
    const resolution = resolver.getResolution({ toolCallId: 'call-1' });
    fake.respond({
      requestId: lastRequestId(fake),
      output: {
        hostToolCall: { toolName: 'get_weather', input: { city: 'Lima' } },
      },
    });

    expect(await resolution).toEqual({
      toolName: 'get_weather',
      input: { city: 'Lima' },
    });
    expect(
      await resolver.getResolution({ toolCallId: 'unknown' }),
    ).toBeUndefined();
    resolver.close();
  });

  it('resolves a standalone tool call without caching it', async () => {
    const fake = createTurn();
    const resolver = createHostToolCallResolver({
      turn: fake.turn,
      serverName: 'ai-sdk-harness-tools',
      toolNames: ['get_weather'],
    });
    const resolution = resolver.resolveToolCall({
      toolCall: { toolCallId: 'permission', rawInput: { city: 'Lima' } },
    });
    expect(fake.emitted.at(-1)?.toolCall).toEqual({
      toolCallId: 'permission',
      title: 'Tool permission',
      rawInput: { city: 'Lima' },
    });
    fake.respond({
      requestId: lastRequestId(fake),
      output: {
        hostToolCall: { toolName: 'get_weather', input: { city: 'Lima' } },
      },
    });

    expect(await resolution).toEqual({
      toolName: 'get_weather',
      input: { city: 'Lima' },
    });
    expect(
      await resolver.getResolution({ toolCallId: 'permission' }),
    ).toBeUndefined();
    resolver.close();
  });

  it.each([
    { hostToolCall: { toolName: 'unknown', input: {} } },
    { hostToolCall: { toolName: 'get_weather', input: null } },
    { hostToolCall: { toolName: 'get_weather', input: [] } },
    { hostToolCall: 'get_weather' },
    null,
  ])('rejects an invalid host response: %j', async output => {
    const fake = createTurn();
    const resolver = createHostToolCallResolver({
      turn: fake.turn,
      serverName: 'ai-sdk-harness-tools',
      toolNames: ['get_weather'],
    });
    const resolution = resolver.resolveUpdate({
      update: { toolCallId: 'call-1', title: 'Tool' },
    });
    fake.respond({ requestId: lastRequestId(fake), output });

    expect(await resolution).toBeUndefined();
    resolver.close();
  });

  it('stops waiting when the turn is aborted or the resolver is closed', async () => {
    const fake = createTurn();
    const resolver = createHostToolCallResolver({
      turn: fake.turn,
      serverName: 'ai-sdk-harness-tools',
      toolNames: ['get_weather'],
    });
    const aborted = resolver.resolveUpdate({
      update: { toolCallId: 'call-1', title: 'Tool' },
    });
    fake.abortController.abort();
    expect(await aborted).toBeUndefined();
    expect(
      await resolver.resolveUpdate({
        update: { toolCallId: 'call-2', title: 'Tool' },
      }),
    ).toBeUndefined();

    const closedFake = createTurn();
    const closedResolver = createHostToolCallResolver({
      turn: closedFake.turn,
      serverName: 'ai-sdk-harness-tools',
      toolNames: ['get_weather'],
    });
    const closed = closedResolver.resolveUpdate({
      update: { toolCallId: 'call-1', title: 'Tool' },
    });
    closedResolver.close();
    expect(await closed).toBeUndefined();
  });
});
