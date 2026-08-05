import { HarnessBridgeCapabilityUnsupportedError } from '@ai-sdk/harness/bridge';
import type * as acp from '@agentclientprotocol/sdk';
import { describe, expect, it, vi } from 'vitest';
import {
  resolveACPSessionRestorationMethod,
  restoreACPBridgeSession,
} from './session-lifecycle';

const initialization = {
  protocolVersion: 1,
  agentCapabilities: {
    loadSession: true,
    sessionCapabilities: {
      resume: {},
      close: {},
    },
  },
} as const;

describe('ACP session restoration', () => {
  it('prefers advertised native resume over load', async () => {
    const order: string[] = [];
    const request = vi.fn(async (...[method]: [string, unknown]) => {
      order.push(`request:${method}`);
      return {
        modes: {
          currentModeId: 'agent',
          availableModes: [],
        },
      };
    });

    const restored = await restoreACPBridgeSession({
      agent: { request } as unknown as acp.ClientContext,
      initialization,
      sessionId: 'session-42',
      cwd: '/workspace',
      mcpServers: [],
      meta: { profile: 'gateway' },
      harnessId: 'codex-acp',
      setHistoricalUpdatesSuppressed: ({ suppressed }) => {
        order.push(`suppressed:${suppressed}`);
      },
      discardCapturedHistory: () => {
        order.push('discard');
      },
    });

    expect(restored).toMatchObject({ method: 'resume' });
    expect(request).toHaveBeenCalledWith('session/resume', {
      sessionId: 'session-42',
      cwd: '/workspace',
      mcpServers: [],
      _meta: { profile: 'gateway' },
    });
    expect(order).toEqual([
      'suppressed:true',
      'request:session/resume',
      'discard',
      'suppressed:false',
    ]);
  });

  it('falls back to load and suppresses semantic and raw history through the response boundary', async () => {
    const semanticUpdates: unknown[] = [];
    const rawUpdates: unknown[] = [];
    const order: string[] = [];
    let suppressed = false;
    const historicalUpdates = [
      { sessionUpdate: 'agent_message_chunk', text: 'old message' },
      { sessionUpdate: 'tool_call', toolCallId: 'old-tool' },
      { sessionUpdate: 'usage_update', used: 100 },
      { sessionUpdate: 'future_history_update', value: true },
    ];
    const request = vi.fn(async (...[method]: [string, unknown]) => {
      order.push(`request:${method}`);
      for (const update of historicalUpdates) {
        rawUpdates.push(update);
        if (!suppressed) semanticUpdates.push(update);
      }
      order.push('response');
      return {
        configOptions: [
          {
            id: 'approval_policy',
            name: 'Approval policy',
            category: 'permission',
            type: 'select' as const,
            currentValue: 'agent',
            options: [],
          },
        ],
      };
    });

    const restored = await restoreACPBridgeSession({
      agent: { request } as unknown as acp.ClientContext,
      initialization: {
        protocolVersion: 1,
        agentCapabilities: {
          loadSession: true,
          sessionCapabilities: {},
        },
      },
      sessionId: 'session-42',
      cwd: '/workspace',
      mcpServers: [],
      meta: undefined,
      harnessId: 'codex-acp',
      setHistoricalUpdatesSuppressed: ({ suppressed: next }) => {
        suppressed = next;
        order.push(`suppressed:${next}`);
      },
      discardCapturedHistory: () => {
        order.push('discard');
        rawUpdates.splice(0);
      },
    });

    expect(restored).toMatchObject({ method: 'load' });
    expect(request).toHaveBeenCalledWith('session/load', {
      sessionId: 'session-42',
      cwd: '/workspace',
      mcpServers: [],
    });
    expect(order).toEqual([
      'suppressed:true',
      'request:session/load',
      'response',
      'discard',
      'suppressed:false',
    ]);
    expect(semanticUpdates).toEqual([]);
    expect(rawUpdates).toEqual([]);

    const newUpdate = {
      sessionUpdate: 'agent_message_chunk',
      text: 'new message',
    };
    rawUpdates.push(newUpdate);
    if (!suppressed) semanticUpdates.push(newUpdate);
    expect(semanticUpdates).toEqual([newUpdate]);
    expect(rawUpdates).toEqual([newUpdate]);
  });

  it('fails precisely when neither restoration capability is advertised', () => {
    expect(() =>
      resolveACPSessionRestorationMethod({
        initialization: {
          protocolVersion: 1,
          agentCapabilities: {
            loadSession: false,
            sessionCapabilities: {},
          },
        },
        harnessId: 'portable-acp',
      }),
    ).toThrow(HarnessBridgeCapabilityUnsupportedError);
    expect(() =>
      resolveACPSessionRestorationMethod({
        initialization: {
          protocolVersion: 1,
          agentCapabilities: {
            loadSession: false,
            sessionCapabilities: {},
          },
        },
        harnessId: 'portable-acp',
      }),
    ).toThrow('sessionCapabilities.resume or loadSession');
  });
});
