import type { SessionUpdate, ToolCallUpdate } from '@agentclientprotocol/sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ACPToolCall } from '../../acp-tool-call';
import { resolveFixtureHostToolCall } from './__fixtures__/fixture-host-tool-call-resolver';
import type { HostToolCall } from './host-tool-call-resolver';
import { createHostToolRelayAuthorization } from './host-tool-relay-authorization';
import { mergeObservedToolCall } from './merge-observed-tool-call';

const serverName = 'ai-sdk-harness-tools';
const toolNames = ['weather', 'clock'];
const weather = { toolName: 'weather', input: { city: 'Lima' } };

/*
 * Resolves the captured adapter formats, plus a direct-input convention used
 * by these tests: a `mcp__<server>__<tool>` name or title, or a programmatic
 * tool name with a matching `_meta.serverName`.
 */
function resolveTestHostToolCall({
  toolCall,
}: {
  toolCall: ACPToolCall;
}): HostToolCall | undefined {
  const fixtureCall = resolveFixtureHostToolCall({
    toolCall,
    serverName,
    toolNames,
  });
  if (fixtureCall != null) return fixtureCall;
  const rawInput = toolCall.rawInput;
  if (
    rawInput == null ||
    typeof rawInput !== 'object' ||
    Array.isArray(rawInput)
  )
    return undefined;
  const toolName = toolNames.find(
    name =>
      toolCall.name === `mcp__${serverName}__${name}` ||
      (toolCall.name == null &&
        toolCall.title === `mcp__${serverName}__${name}`) ||
      (toolCall.name === name && toolCall._meta?.serverName === serverName),
  );
  return toolName == null
    ? undefined
    : { toolName, input: rawInput as Record<string, unknown> };
}

function authorizer({ ttlMs }: { ttlMs?: number } = {}) {
  const authorization = createHostToolRelayAuthorization({ ttlMs });
  const snapshots = new Map<string, ACPToolCall>();
  return {
    ...authorization,
    observeUpdate: ({ update }: { update: SessionUpdate }) => {
      if (
        update.sessionUpdate !== 'tool_call' &&
        update.sessionUpdate !== 'tool_call_update'
      ) {
        authorization.observeUpdate({ update });
        return;
      }
      const toolCall = mergeObservedToolCall({
        previous: snapshots.get(update.toolCallId),
        update,
      });
      snapshots.set(update.toolCallId, toolCall);
      authorization.observeUpdate({
        update,
        hostToolCall: resolveTestHostToolCall({ toolCall }),
      });
    },
  };
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

  it('authorizes the resolved host tool call input of each adapter format', async () => {
    const authorization = authorizer();
    authorization.observeUpdate({
      update: {
        sessionUpdate: 'tool_call',
        toolCallId: 'grok-build',
        title: 'use_tool',
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
        toolCallId: 'github-copilot',
        title: `${serverName}-weather`,
        status: 'pending',
        rawInput: { city: 'Seattle' },
      },
    });

    for (const city of ['Lima', 'Paris', 'Seattle']) {
      await expect(
        authorization.waitForToolCallAuthorization({
          toolName: 'weather',
          input: { city },
        }),
      ).resolves.toBe(true);
    }
    authorization.close();
  });

  it('does not authorize an update that the adapter did not resolve', async () => {
    const authorization = authorizer();
    const rawInput = {
      tool_name: 'other-server__weather',
      tool_input: weather.input,
    };
    authorization.observeUpdate({
      update: {
        sessionUpdate: 'tool_call',
        toolCallId: 'unresolved',
        title: 'use_tool',
        rawInput,
      },
    });
    const pending = [
      authorization.waitForToolCallAuthorization(weather),
      authorization.waitForToolCallAuthorization({
        toolName: 'weather',
        input: rawInput,
      }),
    ];
    authorization.close();
    for (const result of pending) await expect(result).resolves.toBe(false);
  });

  it('uses accepted permission requests as ACP evidence when they precede updates', async () => {
    const authorization = authorizer();
    authorization.authorizePermission({
      toolCallId: 'permission-1',
      call: weather,
    });

    await expect(
      authorization.waitForToolCallAuthorization(weather),
    ).resolves.toBe(true);
    authorization.close();
  });

  it.each([
    { status: 'in_progress' },
    { status: null },
    { title: 'Checking the weather' },
    { name: null, title: null },
    { content: [], rawOutput: { temperature: 72 } },
  ] satisfies Array<Omit<ToolCallUpdate, 'toolCallId'>>)(
    'retains permission-first authorization through a sparse update: %j',
    async patch => {
      const authorization = authorizer();
      authorization.authorizePermission({
        toolCallId: 'permission-first',
        call: weather,
      });
      authorization.observeUpdate({
        update: {
          sessionUpdate: 'tool_call_update',
          toolCallId: 'permission-first',
          ...patch,
        },
      });
      await expect(
        authorization.waitForToolCallAuthorization(weather),
      ).resolves.toBe(true);
      authorization.close();
    },
  );

  it('fulfills pending relay requests through canonical permission grants only once', async () => {
    const authorization = authorizer();
    const pending = authorization.waitForToolCallAuthorization(weather);
    authorization.authorizePermission({
      toolCallId: 'pending-permission',
      call: weather,
    });
    await expect(pending).resolves.toBe(true);
    authorization.authorizePermission({
      toolCallId: 'pending-permission',
      call: weather,
    });
    authorization.observeUpdate({
      update: update({ toolCallId: 'pending-permission' }),
    });
    const replay = authorization.waitForToolCallAuthorization(weather);
    authorization.close();
    await expect(replay).resolves.toBe(false);
  });

  it('does not rearm permission grants consumed before subsequent permissions', async () => {
    const authorization = authorizer();
    authorization.authorizePermission({
      toolCallId: 'consumed-permission',
      call: weather,
    });
    await expect(
      authorization.waitForToolCallAuthorization(weather),
    ).resolves.toBe(true);
    authorization.authorizePermission({
      toolCallId: 'consumed-permission',
      call: weather,
    });
    const replay = authorization.waitForToolCallAuthorization(weather);
    authorization.close();
    await expect(replay).resolves.toBe(false);
  });

  it.each(['completed', 'failed'] as const)(
    'does not rearm a %s permission grant',
    async status => {
      const authorization = authorizer();
      authorization.authorizePermission({
        toolCallId: 'terminal-permission',
        call: weather,
      });
      authorization.observeUpdate({
        update: {
          sessionUpdate: 'tool_call_update',
          toolCallId: 'terminal-permission',
          status,
        },
      });
      authorization.authorizePermission({
        toolCallId: 'terminal-permission',
        call: weather,
      });
      const pending = authorization.waitForToolCallAuthorization(weather);
      authorization.close();
      await expect(pending).resolves.toBe(false);
    },
  );

  it.each([
    { rawInput: null },
    { rawInput: [] },
    { rawInput: { city: 'Quito' } },
    { name: 'different_tool' },
    { _meta: null },
  ] satisfies Array<Omit<ToolCallUpdate, 'toolCallId'>>)(
    'revokes permission-first authorization when new evidence is unresolved: %j',
    async patch => {
      const authorization = authorizer();
      authorization.authorizePermission({
        toolCallId: 'changed-permission',
        call: weather,
      });
      authorization.observeUpdate({
        update: {
          sessionUpdate: 'tool_call_update',
          toolCallId: 'changed-permission',
          ...patch,
        },
      });
      const stale = authorization.waitForToolCallAuthorization(weather);
      authorization.close();
      await expect(stale).resolves.toBe(false);
    },
  );

  it('replaces an unused permission grant with newly resolved notification input', async () => {
    const authorization = authorizer();
    authorization.observeUpdate({
      update: update({ toolCallId: 'replacement' }),
    });
    authorization.authorizePermission({
      toolCallId: 'replacement',
      call: weather,
    });
    authorization.observeUpdate({
      update: {
        sessionUpdate: 'tool_call_update',
        toolCallId: 'replacement',
        rawInput: { city: 'Quito' },
      },
    });
    const stale = authorization.waitForToolCallAuthorization(weather);
    await expect(
      authorization.waitForToolCallAuthorization({
        toolName: 'weather',
        input: { city: 'Quito' },
      }),
    ).resolves.toBe(true);
    authorization.close();
    await expect(stale).resolves.toBe(false);
  });

  it('clears metadata instead of retaining server identity from an earlier notification', async () => {
    const authorization = authorizer();
    authorization.observeUpdate({
      update: {
        sessionUpdate: 'tool_call',
        toolCallId: 'metadata',
        title: 'Weather',
        name: 'weather',
        rawInput: weather.input,
        _meta: { serverName },
      },
    });
    authorization.authorizePermission({
      toolCallId: 'metadata',
      call: weather,
    });
    authorization.observeUpdate({
      update: {
        sessionUpdate: 'tool_call_update',
        toolCallId: 'metadata',
        _meta: null,
      },
    });
    const stale = authorization.waitForToolCallAuthorization(weather);
    authorization.close();
    await expect(stale).resolves.toBe(false);
  });

  it('keeps identical canonical permission grants independent by call ID', async () => {
    const authorization = authorizer();
    for (const toolCallId of ['first-permission', 'second-permission']) {
      authorization.authorizePermission({ toolCallId, call: weather });
    }
    await expect(
      authorization.waitForToolCallAuthorization(weather),
    ).resolves.toBe(true);
    await expect(
      authorization.waitForToolCallAuthorization(weather),
    ).resolves.toBe(true);
    const third = authorization.waitForToolCallAuthorization(weather);
    authorization.close();
    await expect(third).resolves.toBe(false);
  });

  it('closes pending permission requests and ignores later grants', async () => {
    const authorization = authorizer();
    const pending = authorization.waitForToolCallAuthorization(weather);
    authorization.close();
    authorization.authorizePermission({
      toolCallId: 'closed-permission',
      call: weather,
    });
    await expect(pending).resolves.toBe(false);
    await expect(
      authorization.waitForToolCallAuthorization(weather),
    ).resolves.toBe(false);
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
