import type { SessionUpdate, ToolCallUpdate } from '@agentclientprotocol/sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHostToolRelayAuthorization } from './host-tool-relay-authorization';

const serverName = 'ai-sdk-harness-tools';
const weather = { toolName: 'weather', input: { city: 'Lima' } };

function authorizer({ ttlMs }: { ttlMs?: number } = {}) {
  return createHostToolRelayAuthorization({
    serverName,
    toolNames: ['weather', 'clock'],
    ttlMs,
  });
}

function update({
  toolCallId,
  toolName = 'weather',
  rawInput = { city: 'Lima' },
  status = 'in_progress',
}: {
  toolCallId: string;
  toolName?: string;
  rawInput?: Record<string, unknown>;
  status?: 'in_progress' | 'completed' | 'failed';
}): SessionUpdate {
  return {
    sessionUpdate: 'tool_call',
    toolCallId,
    title: `mcp__${serverName}__${toolName}`,
    name: `mcp__${serverName}__${toolName}`,
    status,
    rawInput,
  };
}

describe('createHostToolRelayAuthorization', () => {
  afterEach(() => vi.useRealTimers());

  it('rejects a bearer-only request without an ACP tool call', async () => {
    vi.useFakeTimers();
    const authorization = authorizer({ ttlMs: 20 });
    const pending = authorization.waitForToolCallAuthorization(weather);

    await vi.advanceTimersByTimeAsync(20);

    await expect(pending).resolves.toBe(false);
    authorization.close();
  });

  it('matches name and canonical input from ACP before the relay request, only once', async () => {
    vi.useFakeTimers();
    const authorization = authorizer({ ttlMs: 20 });
    authorization.observeUpdate({
      update: update({ toolCallId: 'call-1', rawInput: { city: 'Lima' } }),
    });

    await expect(
      authorization.waitForToolCallAuthorization(weather),
    ).resolves.toBe(true);
    authorization.observeUpdate({
      update: {
        sessionUpdate: 'tool_call_update',
        toolCallId: 'call-1',
        status: 'in_progress',
      },
    });
    const replay = authorization.waitForToolCallAuthorization(weather);
    await vi.advanceTimersByTimeAsync(20);
    await expect(replay).resolves.toBe(false);
    authorization.close();
  });

  it('does not authorize another tool with the same input', async () => {
    vi.useFakeTimers();
    const authorization = authorizer({ ttlMs: 20 });
    authorization.observeUpdate({ update: update({ toolCallId: 'weather' }) });

    const otherTool = authorization.waitForToolCallAuthorization({
      toolName: 'clock',
      input: weather.input,
    });
    await vi.advanceTimersByTimeAsync(20);

    await expect(otherTool).resolves.toBe(false);
    await expect(
      authorization.waitForToolCallAuthorization(weather),
    ).resolves.toBe(true);
    authorization.close();
  });

  it('accepts a relay request that arrives before the ACP tool call', async () => {
    const authorization = authorizer();
    const pending = authorization.waitForToolCallAuthorization(weather);
    authorization.observeUpdate({ update: update({ toolCallId: 'call-2' }) });

    await expect(pending).resolves.toBe(true);
    authorization.close();
  });

  it('keeps distinct calls and identical concurrent calls separate', async () => {
    const authorization = authorizer();
    const first = authorization.waitForToolCallAuthorization(weather);
    const second = authorization.waitForToolCallAuthorization(weather);
    authorization.observeUpdate({ update: update({ toolCallId: 'first' }) });
    await expect(first).resolves.toBe(true);
    authorization.observeUpdate({ update: update({ toolCallId: 'second' }) });
    await expect(second).resolves.toBe(true);

    authorization.observeUpdate({
      update: update({
        toolCallId: 'third',
        rawInput: { city: 'Paris' },
      }),
    });
    const mismatch = authorization.waitForToolCallAuthorization(weather);
    await expect(
      authorization.waitForToolCallAuthorization({
        toolName: 'weather',
        input: { city: 'Paris' },
      }),
    ).resolves.toBe(true);
    authorization.close();
    await expect(mismatch).resolves.toBe(false);
  });

  it('normalizes nested object key order but does not change array order', async () => {
    const authorization = authorizer();
    authorization.observeUpdate({
      update: update({
        toolCallId: 'canonical',
        rawInput: { a: { c: 1, b: 2 }, list: [1, 2] },
      }),
    });
    await expect(
      authorization.waitForToolCallAuthorization({
        toolName: 'weather',
        input: { list: [1, 2], a: { b: 2, c: 1 } },
      }),
    ).resolves.toBe(true);
    authorization.close();
  });

  it('treats incidental wrapper field names as direct tool arguments', async () => {
    const authorization = authorizer();
    const inputs = [
      { operation: 'add', a: 1, b: 2 },
      { origin: 'user', city: 'Lima' },
      { origin: serverName, operation: 'add', a: 1, b: 2 },
      { providerIdentifier: serverName, city: 'Lima' },
      { providerIdentifier: serverName, toolName: 'weather', city: 'Lima' },
      { server: serverName, tool: 'weather', city: 'Lima' },
      { server: serverName, arguments: { city: 'Lima' }, city: 'Lima' },
    ];

    for (const [index, input] of inputs.entries()) {
      authorization.observeUpdate({
        update: update({ toolCallId: `direct-${index}`, rawInput: input }),
      });
      await expect(
        authorization.waitForToolCallAuthorization({
          toolName: 'weather',
          input,
        }),
      ).resolves.toBe(true);
    }
    authorization.close();
  });

  it('replaces partial input without leaving the old input authorized', async () => {
    const authorization = authorizer({ ttlMs: 20 });
    authorization.observeUpdate({
      update: update({ toolCallId: 'partial', rawInput: {} }),
    });
    authorization.observeUpdate({
      update: {
        sessionUpdate: 'tool_call_update',
        toolCallId: 'partial',
        rawInput: weather.input,
      },
    });

    const stale = authorization.waitForToolCallAuthorization({
      toolName: 'weather',
      input: {},
    });
    const current = authorization.waitForToolCallAuthorization(weather);
    authorization.close();
    await expect(stale).resolves.toBe(false);
    await expect(current).resolves.toBe(true);
  });

  it('authorizes a pending full-input request after partial input', async () => {
    const authorization = authorizer({ ttlMs: 20 });
    authorization.observeUpdate({
      update: update({ toolCallId: 'partial-request', rawInput: {} }),
    });
    const pending = authorization.waitForToolCallAuthorization(weather);
    authorization.observeUpdate({
      update: {
        sessionUpdate: 'tool_call_update',
        toolCallId: 'partial-request',
        rawInput: weather.input,
      },
    });
    authorization.close();
    await expect(pending).resolves.toBe(true);
    await expect(
      authorization.waitForToolCallAuthorization(weather),
    ).resolves.toBe(false);
  });

  it('retains the latest input through status-only updates', async () => {
    const authorization = authorizer();
    authorization.observeUpdate({
      update: update({ toolCallId: 'status-only', rawInput: {} }),
    });
    authorization.observeUpdate({
      update: {
        sessionUpdate: 'tool_call_update',
        toolCallId: 'status-only',
        rawInput: weather.input,
      },
    });
    authorization.observeUpdate({
      update: {
        sessionUpdate: 'tool_call_update',
        toolCallId: 'status-only',
        status: 'in_progress',
      },
    });

    await expect(
      authorization.waitForToolCallAuthorization(weather),
    ).resolves.toBe(true);
    authorization.close();
  });

  it('removes an unused authorization when later input becomes unresolvable', async () => {
    const authorization = authorizer();
    authorization.observeUpdate({ update: update({ toolCallId: 'invalid' }) });
    authorization.observeUpdate({
      update: {
        sessionUpdate: 'tool_call_update',
        toolCallId: 'invalid',
        rawInput: null,
      },
    });

    const stale = authorization.waitForToolCallAuthorization(weather);
    authorization.close();
    await expect(stale).resolves.toBe(false);
  });

  it('does not authorize unqualified, unknown, mismatched, or completed updates', async () => {
    const authorization = authorizer();
    authorization.observeUpdate({
      update: {
        sessionUpdate: 'tool_call',
        toolCallId: 'native',
        title: 'weather',
        name: 'weather',
        rawInput: weather.input,
      },
    });
    authorization.observeUpdate({
      update: update({ toolCallId: 'unknown', toolName: 'secret' }),
    });
    authorization.observeUpdate({
      update: update({ toolCallId: 'finished', status: 'completed' }),
    });
    authorization.observeUpdate({
      update: update({ toolCallId: 'other', rawInput: { city: 'Quito' } }),
    });
    const pending = authorization.waitForToolCallAuthorization(weather);
    authorization.close();
    await expect(pending).resolves.toBe(false);
  });

  it('unpacks known ACP wrappers and rejects conflicting or malformed wrappers', async () => {
    const authorization = authorizer();
    authorization.observeUpdate({
      update: {
        sessionUpdate: 'tool_call',
        toolCallId: 'deferred',
        title: 'Deferred tool',
        name: 'use_tool',
        rawInput: {
          tool_name: `${serverName}__weather`,
          tool_input: { city: 'Lima' },
        },
      },
    });
    authorization.observeUpdate({
      update: {
        sessionUpdate: 'tool_call',
        toolCallId: 'cursor',
        title: 'Weather',
        rawInput: {
          providerIdentifier: serverName,
          toolName: 'weather',
          args: { city: 'Paris' },
        },
      },
    });
    authorization.observeUpdate({
      update: {
        sessionUpdate: 'tool_call',
        toolCallId: 'portable',
        title: 'Weather',
        rawInput: {
          origin: serverName,
          operation: 'weather',
          arguments: { city: 'Quito' },
        },
      },
    });
    authorization.observeUpdate({
      update: {
        sessionUpdate: 'tool_call',
        toolCallId: 'codex',
        title: 'Weather',
        rawInput: {
          server: serverName,
          tool: 'weather',
          arguments: { city: 'Tokyo' },
        },
      },
    });
    authorization.observeUpdate({
      update: {
        sessionUpdate: 'tool_call',
        toolCallId: 'fx',
        title: 'Weather',
        name: `mcp_${serverName}_weather`,
        rawInput: { city: 'Reykjavik' },
      },
    });
    authorization.observeUpdate({
      update: {
        sessionUpdate: 'tool_call',
        toolCallId: 'copilot',
        title: `${serverName}-weather`,
        status: 'pending',
        rawInput: { city: 'Seattle' },
      },
    });

    await expect(
      authorization.waitForToolCallAuthorization(weather),
    ).resolves.toBe(true);
    await expect(
      authorization.waitForToolCallAuthorization({
        toolName: 'weather',
        input: { city: 'Paris' },
      }),
    ).resolves.toBe(true);
    await expect(
      authorization.waitForToolCallAuthorization({
        toolName: 'weather',
        input: { city: 'Quito' },
      }),
    ).resolves.toBe(true);
    await expect(
      authorization.waitForToolCallAuthorization({
        toolName: 'weather',
        input: { city: 'Tokyo' },
      }),
    ).resolves.toBe(true);
    await expect(
      authorization.waitForToolCallAuthorization({
        toolName: 'weather',
        input: { city: 'Reykjavik' },
      }),
    ).resolves.toBe(true);
    await expect(
      authorization.waitForToolCallAuthorization({
        toolName: 'weather',
        input: { city: 'Seattle' },
      }),
    ).resolves.toBe(true);

    authorization.observeUpdate({
      update: update({
        toolCallId: 'conflicting',
        rawInput: {
          tool_name: `other-server__weather`,
          tool_input: weather.input,
        },
      }),
    });
    authorization.observeUpdate({
      update: update({
        toolCallId: 'malformed',
        rawInput: { tool_name: `${serverName}__weather`, tool_input: null },
      }),
    });
    authorization.observeUpdate({
      update: update({
        toolCallId: 'ambiguous',
        rawInput: {
          tool_name: `other-server__weather`,
          tool_input: weather.input,
          server: serverName,
          tool: 'weather',
          arguments: weather.input,
        },
      }),
    });
    const conflictingOrigin = {
      origin: 'other-server',
      operation: 'weather',
      arguments: weather.input,
    };
    authorization.observeUpdate({
      update: update({
        toolCallId: 'conflicting-origin',
        rawInput: conflictingOrigin,
      }),
    });
    const invalid = [
      authorization.waitForToolCallAuthorization(weather),
      authorization.waitForToolCallAuthorization({
        toolName: 'weather',
        input: conflictingOrigin,
      }),
      authorization.waitForToolCallAuthorization({
        toolName: 'weather',
        input: { tool_name: `${serverName}__weather`, tool_input: null },
      }),
    ];
    authorization.close();
    for (const pending of invalid) await expect(pending).resolves.toBe(false);
  });

  it('uses accepted permission requests as ACP evidence when they precede updates', async () => {
    const authorization = authorizer();
    const permission: ToolCallUpdate = {
      toolCallId: 'permission-1',
      status: 'pending',
      title: `mcp__${serverName}__weather`,
      rawInput: weather.input,
    };
    authorization.observeAllowedPermission({ toolCall: permission });

    await expect(
      authorization.waitForToolCallAuthorization(weather),
    ).resolves.toBe(true);
    authorization.close();
  });

  it('keeps an unused authorization until consumption, terminal status, or close', async () => {
    vi.useFakeTimers();
    const authorization = authorizer({ ttlMs: 20 });
    authorization.observeUpdate({ update: update({ toolCallId: 'delayed' }) });
    await vi.advanceTimersByTimeAsync(21);
    await expect(
      authorization.waitForToolCallAuthorization(weather),
    ).resolves.toBe(true);

    authorization.observeUpdate({ update: update({ toolCallId: 'later' }) });
    await vi.advanceTimersByTimeAsync(21);
    authorization.observeUpdate({
      update: {
        sessionUpdate: 'tool_call_update',
        toolCallId: 'later',
        status: 'in_progress',
      },
    });
    await expect(
      authorization.waitForToolCallAuthorization(weather),
    ).resolves.toBe(true);

    authorization.observeUpdate({ update: update({ toolCallId: 'terminal' }) });
    authorization.observeUpdate({
      update: {
        sessionUpdate: 'tool_call_update',
        toolCallId: 'terminal',
        status: 'failed',
      },
    });
    authorization.observeUpdate({
      update: update({ toolCallId: 'terminal' }),
    });
    const terminated = authorization.waitForToolCallAuthorization(weather);
    authorization.observeUpdate({
      update: update({ toolCallId: 'on-close', rawInput: { city: 'Quito' } }),
    });
    authorization.close();
    await expect(terminated).resolves.toBe(false);
    await expect(
      authorization.waitForToolCallAuthorization({
        toolName: 'weather',
        input: { city: 'Quito' },
      }),
    ).resolves.toBe(false);
  });
});
