import type { ActiveSessionMessage } from '@agentclientprotocol/sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHostToolCorrelation } from './host-tool-correlation';

describe('createHostToolCorrelation', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('matches ACP-before-MCP using server, tool, input, and invocation order', () => {
    const { correlation, semantic, raw } = setup();
    correlation.update({
      message: toolUpdate({
        toolCallId: 'display-1',
        status: 'in_progress',
      }),
      rawUpdate: portableUpdate({
        toolCallId: 'display-1',
        toolName: 'weather',
        input: { unit: 'celsius', city: 'Lima' },
      }),
    });
    expect(semantic).toEqual([]);

    register({
      correlation,
      token: 'accepted-token',
      toolName: 'weather',
      input: { city: 'Lima', unit: 'celsius' },
      order: 1,
    });
    correlation.update({
      message: toolUpdate({
        toolCallId: 'display-1',
        status: 'completed',
        update: true,
      }),
    });

    expect(semantic).toEqual([]);
    expect(raw).toHaveLength(2);
  });

  it('matches MCP-before-ACP using portable evidence', () => {
    const { correlation, semantic, raw } = setup();
    register({
      correlation,
      token: 'accepted-first',
      toolName: 'weather',
      input: { city: 'Lima' },
      order: 1,
    });
    correlation.update({
      message: toolUpdate({
        toolCallId: 'display-2',
        status: 'completed',
      }),
      rawUpdate: portableUpdate({
        toolCallId: 'display-2',
        toolName: 'weather',
        input: { city: 'Lima' },
        status: 'completed',
      }),
    });

    expect(semantic).toEqual([]);
    expect(raw).toHaveLength(1);
  });

  it('matches Cursor MCP updates by provider, tool, and nested args', () => {
    const { correlation, semantic, raw } = setup();
    register({
      correlation,
      token: 'cursor-token',
      toolName: 'weather',
      input: { city: 'Lima' },
      order: 1,
    });
    const rawUpdate = {
      sessionUpdate: 'tool_call',
      toolCallId: 'cursor-mcp-call',
      title: 'ai-sdk-harness-tools: weather',
      kind: 'other',
      status: 'completed',
      rawInput: {
        providerIdentifier: 'ai-sdk-harness-tools',
        toolName: 'weather',
        args: { city: 'Lima' },
      },
    } as const;
    correlation.update({
      message: update(rawUpdate),
      rawUpdate,
    });

    expect(semantic).toEqual([]);
    expect(raw).toEqual([rawUpdate]);
  });

  it('uses an exact result token as the strongest correlation evidence', () => {
    const { correlation, semantic, raw } = setup();
    const rawUpdate = {
      sessionUpdate: 'tool_call',
      toolCallId: 'display-3',
      status: 'completed',
      rawOutput: { result: { metadata: 'registered-after-notification' } },
    };
    correlation.update({
      message: toolUpdate({
        toolCallId: 'display-3',
        status: 'completed',
      }),
      rawUpdate,
    });
    register({
      correlation,
      token: 'registered-after-notification',
      toolName: 'weather',
      input: { city: 'Lima' },
      order: 1,
    });

    expect(semantic).toEqual([]);
    expect(raw).toEqual([rawUpdate]);
  });

  it('claims a host permission from the observed combined MCP identity and input', () => {
    const { correlation, semantic, raw } = setup({
      hostTools: [{ name: 'get_weather' }],
    });
    const toolCall = {
      toolCallId: 'toolu_01UTvc8ZcXBubKg5RqvTr8mo',
      title: 'mcp__ai-sdk-harness-tools__get_weather',
      kind: 'other',
      status: 'pending',
      rawInput: { city: 'Lima' },
    } as const;
    const rawUpdate = {
      sessionUpdate: 'tool_call',
      ...toolCall,
      _meta: {
        claudeCode: {
          toolName: 'mcp__ai-sdk-harness-tools__get_weather',
        },
      },
    } as const;
    correlation.update({
      message: update(rawUpdate),
      rawUpdate,
    });

    expect(
      correlation.claimHostToolPermission({
        toolCall,
      }),
    ).toBe(true);
    correlation.update({
      message: toolUpdate({
        toolCallId: toolCall.toolCallId,
        status: 'completed',
        update: true,
      }),
    });

    expect(semantic).toEqual([]);
    expect(raw).toHaveLength(2);
  });

  it('claims a host permission before its generic deferred-tool update arrives', () => {
    const { correlation } = setup({
      hostTools: [{ name: 'get_weather' }],
    });
    const toolCall = deferredToolPermission({
      toolCallId: 'permission-before-update',
      combinedToolName: 'ai-sdk-harness-tools__get_weather',
      input: { city: 'Lima' },
    });

    expect(correlation.claimHostToolPermission({ toolCall })).toBe(true);
  });

  it('suppresses the later update for a permission claimed before the update', () => {
    const { correlation, semantic, raw } = setup({
      hostTools: [{ name: 'get_weather' }],
    });
    const toolCall = deferredToolPermission({
      toolCallId: 'later-provider-update',
      combinedToolName: 'ai-sdk-harness-tools__get_weather',
      input: { city: 'Lima' },
    });
    expect(correlation.claimHostToolPermission({ toolCall })).toBe(true);

    const rawUpdate = {
      sessionUpdate: 'tool_call',
      ...toolCall,
      status: 'completed',
      _meta: {
        protocol: {
          toolName: 'use_tool',
        },
      },
    } as const;
    correlation.update({
      message: update(rawUpdate),
      rawUpdate,
    });

    expect(semantic).toEqual([]);
    expect(raw).toEqual([rawUpdate]);
  });

  it('does not unwrap a deferred-tool input with mismatched host identity', () => {
    const { correlation } = setup({
      hostTools: [{ name: 'get_weather' }],
    });
    const toolCall = deferredToolPermission({
      toolCallId: 'deferred-identity-mismatch',
      combinedToolName: 'ai-sdk-harness-tools__get_weather_forecast',
      input: { city: 'Lima' },
      title: 'ai-sdk-harness-tools__get_weather',
    });

    expect(correlation.claimHostToolPermission({ toolCall })).toBe(false);
  });

  it('does not claim a deferred-tool permission with different candidate input', () => {
    const { correlation } = setup({
      hostTools: [{ name: 'get_weather' }],
    });
    correlation.update({
      message: toolUpdate({
        toolCallId: 'deferred-input-mismatch',
        status: 'in_progress',
      }),
      rawUpdate: portableUpdate({
        toolCallId: 'deferred-input-mismatch',
        toolName: 'get_weather',
        input: { city: 'Lima' },
      }),
    });
    const toolCall = deferredToolPermission({
      toolCallId: 'deferred-input-mismatch',
      combinedToolName: 'ai-sdk-harness-tools__get_weather',
      input: { city: 'Quito' },
    });

    expect(correlation.claimHostToolPermission({ toolCall })).toBe(false);
  });

  it('does not claim combined MCP identity with different input', () => {
    const { correlation } = setup({
      hostTools: [{ name: 'get_weather' }],
    });
    const rawUpdate = {
      sessionUpdate: 'tool_call',
      toolCallId: 'toolu_input_mismatch',
      title: 'mcp__ai-sdk-harness-tools__get_weather',
      kind: 'other',
      status: 'pending',
      rawInput: { city: 'Lima' },
      _meta: {
        claudeCode: {
          toolName: 'mcp__ai-sdk-harness-tools__get_weather',
        },
      },
    } as const;
    correlation.update({
      message: update(rawUpdate),
      rawUpdate,
    });

    expect(
      correlation.claimHostToolPermission({
        toolCall: {
          toolCallId: rawUpdate.toolCallId,
          kind: 'other',
          status: 'pending',
          rawInput: { city: 'Quito' },
        },
      }),
    ).toBe(false);
  });

  it('does not claim a tool name suffix from a combined MCP identity', () => {
    const { correlation } = setup({
      hostTools: [{ name: 'weather' }],
    });
    const rawUpdate = {
      sessionUpdate: 'tool_call',
      toolCallId: 'toolu_tool_name_suffix',
      title: 'mcp__ai-sdk-harness-tools__get_weather',
      kind: 'other',
      status: 'pending',
      rawInput: { city: 'Lima' },
      _meta: {
        claudeCode: {
          toolName: 'mcp__ai-sdk-harness-tools__get_weather',
        },
      },
    } as const;
    correlation.update({
      message: update(rawUpdate),
      rawUpdate,
    });

    expect(
      correlation.claimHostToolPermission({
        toolCall: {
          toolCallId: rawUpdate.toolCallId,
          kind: 'other',
          status: 'pending',
          rawInput: rawUpdate.rawInput,
        },
      }),
    ).toBe(false);
  });

  it('does not claim a duplicate host tool identity', () => {
    const { correlation } = setup({
      hostTools: [{ name: 'get_weather' }, { name: 'get_weather' }],
    });
    const rawUpdate = {
      sessionUpdate: 'tool_call',
      toolCallId: 'toolu_ambiguous',
      title: 'mcp__ai-sdk-harness-tools__get_weather',
      kind: 'other',
      status: 'pending',
      rawInput: { city: 'Lima' },
      _meta: {
        protocol: {
          toolName: 'mcp__ai-sdk-harness-tools__get_weather',
        },
      },
    } as const;
    correlation.update({
      message: update(rawUpdate),
      rawUpdate,
    });

    expect(
      correlation.claimHostToolPermission({
        toolCall: {
          toolCallId: rawUpdate.toolCallId,
          kind: 'other',
          status: 'pending',
          rawInput: rawUpdate.rawInput,
        },
      }),
    ).toBe(false);
  });

  it('preserves an explicit null raw update', () => {
    const { correlation, raw } = setup();
    correlation.update({
      message: update({
        sessionUpdate: 'agent_message_chunk',
        content: { type: 'text', text: 'message' },
      }),
      rawUpdate: null,
    });

    expect(raw).toEqual([null]);
  });

  it('flushes unmatched candidates in original order after the bound', async () => {
    vi.useFakeTimers();
    const { correlation, semantic, raw } = setup();
    const nativeStart = toolUpdate({
      toolCallId: 'native-1',
      status: 'in_progress',
    });
    const text = update({
      sessionUpdate: 'agent_message_chunk',
      content: { type: 'text', text: 'after native' },
    });
    const nativeEnd = toolUpdate({
      toolCallId: 'native-1',
      status: 'completed',
      update: true,
    });
    correlation.update({ message: nativeStart });
    correlation.update({ message: text });
    correlation.update({ message: nativeEnd });
    expect(semantic).toEqual([]);

    await vi.advanceTimersByTimeAsync(1000);

    expect(semantic.map(item => item.message)).toEqual([
      nativeStart,
      text,
      nativeEnd,
    ]);
    expect(raw).toHaveLength(3);
  });

  it('does not suppress a title-only candidate', async () => {
    vi.useFakeTimers();
    const { correlation, semantic } = setup();
    register({
      correlation,
      token: 'unrelated',
      toolName: 'weather',
      input: { city: 'Lima' },
      order: 1,
    });
    const candidate = update({
      sessionUpdate: 'tool_call',
      toolCallId: 'title-only',
      title: 'weather',
      status: 'completed',
    });
    correlation.update({ message: candidate });

    await vi.advanceTimersByTimeAsync(1000);

    expect(semantic.map(item => item.message)).toEqual([candidate]);
  });

  it('keeps distinct concurrent invocations separate', () => {
    const { correlation, semantic, raw } = setup();
    register({
      correlation,
      token: 'lima-token',
      toolName: 'weather',
      input: { city: 'Lima' },
      order: 1,
    });
    register({
      correlation,
      token: 'quito-token',
      toolName: 'weather',
      input: { city: 'Quito' },
      order: 2,
    });
    correlation.update({
      message: toolUpdate({ toolCallId: 'quito', status: 'in_progress' }),
      rawUpdate: portableUpdate({
        toolCallId: 'quito',
        toolName: 'weather',
        input: { city: 'Quito' },
      }),
    });
    correlation.update({
      message: toolUpdate({ toolCallId: 'lima', status: 'in_progress' }),
      rawUpdate: portableUpdate({
        toolCallId: 'lima',
        toolName: 'weather',
        input: { city: 'Lima' },
      }),
    });
    correlation.update({
      message: toolUpdate({
        toolCallId: 'quito',
        status: 'completed',
        update: true,
      }),
    });
    correlation.update({
      message: toolUpdate({
        toolCallId: 'lima',
        status: 'completed',
        update: true,
      }),
    });

    expect(semantic).toEqual([]);
    expect(raw).toHaveLength(4);
  });

  it('pairs identical concurrent invocations by FIFO order', () => {
    const { correlation, semantic, raw } = setup();
    for (const toolCallId of ['first', 'second']) {
      correlation.update({
        message: toolUpdate({ toolCallId, status: 'in_progress' }),
        rawUpdate: portableUpdate({
          toolCallId,
          toolName: 'weather',
          input: { city: 'Lima' },
        }),
      });
    }
    register({
      correlation,
      token: 'first-token',
      toolName: 'weather',
      input: { city: 'Lima' },
      order: 1,
    });
    register({
      correlation,
      token: 'second-token',
      toolName: 'weather',
      input: { city: 'Lima' },
      order: 2,
    });
    for (const toolCallId of ['second', 'first']) {
      correlation.update({
        message: toolUpdate({
          toolCallId,
          status: 'completed',
          update: true,
        }),
      });
    }

    expect(semantic).toEqual([]);
    expect(raw).toHaveLength(4);
  });

  it('expires unmatched invocation state conservatively', async () => {
    vi.useFakeTimers();
    const { correlation, semantic } = setup();
    register({
      correlation,
      token: 'expired-token',
      toolName: 'weather',
      input: { city: 'Lima' },
      order: 1,
    });
    await vi.advanceTimersByTimeAsync(1000);

    const candidate = toolUpdate({
      toolCallId: 'late-display',
      status: 'completed',
    });
    correlation.update({
      message: candidate,
      rawUpdate: portableUpdate({
        toolCallId: 'late-display',
        toolName: 'weather',
        input: { city: 'Lima' },
        status: 'completed',
      }),
    });
    await vi.advanceTimersByTimeAsync(1000);

    expect(semantic.map(item => item.message)).toEqual([candidate]);
  });

  it('flushes unproven calls on close', () => {
    const { correlation, semantic, raw } = setup();
    const pending = toolUpdate({
      toolCallId: 'pending',
      status: 'in_progress',
    });
    correlation.update({ message: pending });
    correlation.close();

    expect(semantic.map(item => item.message)).toEqual([pending]);
    expect(raw).toHaveLength(1);
  });
});

function setup({
  hostTools = [{ name: 'weather' }],
}: {
  hostTools?: ReadonlyArray<{ readonly name: string }>;
} = {}) {
  const semantic: Array<{
    message: Extract<ActiveSessionMessage, { kind: 'session_update' }>;
    rawUpdate: unknown;
  }> = [];
  const raw: unknown[] = [];
  const correlation = createHostToolCorrelation({
    emitSemanticUpdate: value => semantic.push(value),
    emitRawUpdate: ({ rawUpdate }) => raw.push(rawUpdate),
    hostToolServerName: 'ai-sdk-harness-tools',
    hostTools,
  });
  return { correlation, semantic, raw };
}

function register({
  correlation,
  token,
  toolName,
  input,
  order,
}: {
  correlation: ReturnType<typeof createHostToolCorrelation>;
  token: string;
  toolName: string;
  input: Readonly<Record<string, unknown>>;
  order: number;
}): void {
  correlation.registerInvocation({
    token,
    serverName: 'ai-sdk-harness-tools',
    toolName,
    input,
    order,
  });
}

function portableUpdate({
  toolCallId,
  toolName,
  input,
  status = 'in_progress',
}: {
  toolCallId: string;
  toolName: string;
  input: Readonly<Record<string, unknown>>;
  status?: 'in_progress' | 'completed';
}): unknown {
  return {
    sessionUpdate: 'tool_call',
    toolCallId,
    name: toolName,
    status,
    rawInput: {
      origin: 'ai-sdk-harness-tools',
      operation: toolName,
      arguments: input,
    },
  };
}

function deferredToolPermission({
  toolCallId,
  combinedToolName,
  input,
  title = combinedToolName,
}: {
  toolCallId: string;
  combinedToolName: string;
  input: Readonly<Record<string, unknown>>;
  title?: string;
}) {
  return {
    toolCallId,
    title,
    kind: 'other',
    status: 'pending',
    rawInput: {
      variant: 'UseTool',
      tool_name: combinedToolName,
      tool_input: input,
    },
  } as const;
}

function toolUpdate({
  toolCallId,
  status,
  update: isUpdate = false,
}: {
  toolCallId: string;
  status: 'in_progress' | 'completed';
  update?: boolean;
}): Extract<ActiveSessionMessage, { kind: 'session_update' }> {
  return isUpdate
    ? update({
        sessionUpdate: 'tool_call_update',
        toolCallId,
        status,
      })
    : update({
        sessionUpdate: 'tool_call',
        toolCallId,
        title: 'opaque display',
        status,
      });
}

function update(
  value: Extract<ActiveSessionMessage, { kind: 'session_update' }>['update'],
): Extract<ActiveSessionMessage, { kind: 'session_update' }> {
  return {
    kind: 'session_update',
    notification: {
      sessionId: 'session-1',
      update: value,
    },
    update: value,
  };
}
