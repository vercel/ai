import { HarnessCapabilityUnsupportedError } from '@ai-sdk/harness';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as index from './index';
import { createEve } from './eve-harness';

describe('createEve adapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('exports only a factory and declares Eve built-in tools', () => {
    expect(index).toHaveProperty('createEve');
    expect(index).not.toHaveProperty('eve');

    const harness = createEve({ url: 'https://eve.test' });
    expect(harness.harnessId).toBe('eve');
    expect(harness.specificationVersion).toBe('harness-v1');
    expect(harness.supportsBuiltinToolApprovals).toBe(true);
    expect(harness.getBootstrap).toBeUndefined();
    expect(Object.keys(harness.builtinTools).sort()).toEqual([
      'agent',
      'bash',
      'connection_search',
      'glob',
      'grep',
      'load_skill',
      'read',
      'todo',
      'webSearch',
      'web_fetch',
      'write',
    ]);
    expect(harness.builtinTools.read.nativeName).toBe('read_file');
    expect(harness.builtinTools.write.nativeName).toBe('write_file');
    expect(harness.builtinTools.webSearch.nativeName).toBe('web_search');
    expect(harness.builtinTools).not.toHaveProperty('ask_question');
  });

  it('streams text, reasoning, usage, and finish events from Eve', async () => {
    const mock = mockEveFetch({
      streams: [
        [
          sessionStartedEvent(),
          {
            type: 'reasoning.appended',
            data: {
              reasoningDelta: 'thinking',
              reasoningSoFar: 'thinking',
              sequence: 1,
              stepIndex: 0,
              turnId: 'turn-1',
            },
          },
          {
            type: 'reasoning.completed',
            data: {
              reasoning: 'thinking',
              sequence: 2,
              stepIndex: 0,
              turnId: 'turn-1',
            },
          },
          {
            type: 'message.appended',
            data: {
              messageDelta: 'Hello',
              messageSoFar: 'Hello',
              sequence: 3,
              stepIndex: 0,
              turnId: 'turn-1',
            },
          },
          {
            type: 'message.completed',
            data: {
              finishReason: 'stop',
              message: 'Hello world',
              sequence: 4,
              stepIndex: 0,
              turnId: 'turn-1',
            },
          },
          {
            type: 'step.completed',
            data: {
              finishReason: 'stop',
              sequence: 5,
              stepIndex: 0,
              turnId: 'turn-1',
              usage: {
                inputTokens: 10,
                outputTokens: 2,
                cacheReadTokens: 3,
                cacheWriteTokens: 4,
              },
            },
          },
          { type: 'session.completed' },
        ],
      ],
    });

    const session = await createStartedSession();
    const parts: unknown[] = [];
    const control = await session.doPromptTurn({
      prompt: 'hello',
      instructions: 'be concise',
      emit: part => parts.push(part),
    });
    await control.done;

    expect(mock.postBodies[0]).toEqual({
      message: 'hello',
      clientContext: 'be concise',
    });
    expect(parts).toMatchInlineSnapshot(`
      [
        {
          "modelId": "anthropic/claude-sonnet-4-6",
          "type": "stream-start",
        },
        {
          "id": "eve-reasoning-0-1",
          "type": "reasoning-start",
        },
        {
          "delta": "thinking",
          "id": "eve-reasoning-0-1",
          "type": "reasoning-delta",
        },
        {
          "id": "eve-reasoning-0-1",
          "type": "reasoning-end",
        },
        {
          "id": "eve-text-0-1",
          "type": "text-start",
        },
        {
          "delta": "Hello",
          "id": "eve-text-0-1",
          "type": "text-delta",
        },
        {
          "delta": " world",
          "id": "eve-text-0-1",
          "type": "text-delta",
        },
        {
          "id": "eve-text-0-1",
          "type": "text-end",
        },
        {
          "finishReason": {
            "raw": "stop",
            "unified": "stop",
          },
          "type": "finish-step",
          "usage": {
            "inputTokens": {
              "cacheRead": 3,
              "cacheWrite": 4,
              "noCache": 3,
              "total": 10,
            },
            "outputTokens": {
              "reasoning": undefined,
              "text": undefined,
              "total": 2,
            },
            "raw": {
              "cacheReadTokens": 3,
              "cacheWriteTokens": 4,
              "inputTokens": 10,
              "outputTokens": 2,
            },
          },
        },
        {
          "finishReason": {
            "raw": "stop",
            "unified": "stop",
          },
          "totalUsage": {
            "inputTokens": {
              "cacheRead": 3,
              "cacheWrite": 4,
              "noCache": 3,
              "total": 10,
            },
            "outputTokens": {
              "reasoning": undefined,
              "text": undefined,
              "total": 2,
            },
            "raw": {},
          },
          "type": "finish",
        },
      ]
    `);
  });

  it('marks agent-specific Eve tools as dynamic provider-executed calls', async () => {
    mockEveFetch({
      streams: [
        [
          sessionStartedEvent(),
          {
            type: 'actions.requested',
            data: {
              actions: [
                {
                  kind: 'tool-call',
                  callId: 'call-1',
                  toolName: 'project_tool',
                  input: { task: 'inspect' },
                },
              ],
              sequence: 1,
              stepIndex: 0,
              turnId: 'turn-1',
            },
          },
          {
            type: 'action.result',
            data: {
              result: {
                kind: 'tool-result',
                callId: 'call-1',
                toolName: 'project_tool',
                output: { ok: true },
              },
              sequence: 2,
              stepIndex: 0,
              status: 'completed',
              turnId: 'turn-1',
            },
          },
          {
            type: 'step.completed',
            data: {
              finishReason: 'tool-calls',
              sequence: 3,
              stepIndex: 0,
              turnId: 'turn-1',
            },
          },
          { type: 'session.completed' },
        ],
      ],
    });

    const session = await createStartedSession();
    const parts: unknown[] = [];
    const control = await session.doPromptTurn({
      prompt: 'use the project tool',
      emit: part => parts.push(part),
    });
    await control.done;

    expect(parts).toContainEqual({
      type: 'tool-call',
      toolCallId: 'call-1',
      toolName: 'project_tool',
      input: JSON.stringify({ task: 'inspect' }),
      providerExecuted: true,
      dynamic: true,
    });
    expect(parts).toContainEqual({
      type: 'tool-result',
      toolCallId: 'call-1',
      toolName: 'project_tool',
      result: { ok: true },
      dynamic: true,
    });
  });

  it('supports Eve confirmation approvals through inputResponses', async () => {
    const mock = mockEveFetch({
      streams: [
        [
          sessionStartedEvent(),
          {
            type: 'actions.requested',
            data: {
              actions: [
                {
                  kind: 'tool-call',
                  callId: 'call-1',
                  toolName: 'bash',
                  input: { command: 'pwd' },
                },
              ],
              sequence: 1,
              stepIndex: 0,
              turnId: 'turn-1',
            },
          },
          {
            type: 'input.requested',
            data: {
              requests: [
                {
                  action: {
                    kind: 'tool-call',
                    callId: 'call-1',
                    toolName: 'bash',
                    input: { command: 'pwd' },
                  },
                  display: 'confirmation',
                  options: [
                    { id: 'approve', label: 'Approve' },
                    { id: 'deny', label: 'Deny' },
                  ],
                  prompt: 'Run command?',
                  requestId: 'approval-1',
                },
              ],
              sequence: 2,
              stepIndex: 0,
              turnId: 'turn-1',
            },
          },
          {
            type: 'step.completed',
            data: {
              finishReason: 'tool-calls',
              sequence: 3,
              stepIndex: 0,
              turnId: 'turn-1',
            },
          },
          {
            type: 'session.waiting',
            data: { wait: 'next-user-message' },
          },
        ],
        [
          {
            type: 'action.result',
            data: {
              result: {
                kind: 'tool-result',
                callId: 'call-1',
                toolName: 'bash',
                output: '/workspace',
              },
              sequence: 4,
              stepIndex: 0,
              status: 'completed',
              turnId: 'turn-1',
            },
          },
          {
            type: 'message.completed',
            data: {
              finishReason: 'stop',
              message: 'The working directory is /workspace.',
              sequence: 5,
              stepIndex: 1,
              turnId: 'turn-1',
            },
          },
          {
            type: 'step.completed',
            data: {
              finishReason: 'stop',
              sequence: 6,
              stepIndex: 1,
              turnId: 'turn-1',
            },
          },
          { type: 'session.completed' },
        ],
      ],
    });

    const session = await createStartedSession();
    const firstParts: unknown[] = [];
    const first = await session.doPromptTurn({
      prompt: 'run pwd',
      emit: part => firstParts.push(part),
    });
    await first.done;

    expect(firstParts).toContainEqual({
      type: 'tool-approval-request',
      approvalId: 'approval-1',
      toolCallId: 'call-1',
    });

    const state = await session.doSuspendTurn();
    const resumed = await createStartedSession({
      continueFrom: {
        ...state,
        pendingToolApprovals: [
          {
            approvalId: 'approval-1',
            toolCallId: 'call-1',
            toolName: 'bash',
            input: JSON.stringify({ command: 'pwd' }),
            kind: 'builtin',
            providerExecuted: true,
          },
        ],
      },
    });
    const secondParts: unknown[] = [];
    const second = await resumed.doContinueTurn({
      emit: part => secondParts.push(part),
    });

    await second.submitToolApproval?.({
      approvalId: 'approval-1',
      approved: true,
      reason: 'ok',
    });
    await second.done;

    expect(mock.postBodies[1]).toEqual({
      continuationToken: 'continuation-1',
      inputResponses: [
        {
          requestId: 'approval-1',
          optionId: 'approve',
          text: 'ok',
        },
      ],
    });
    expect(secondParts).toContainEqual({
      type: 'tool-result',
      toolCallId: 'call-1',
      toolName: 'bash',
      result: '/workspace',
    });
  });

  it('throws for unsupported custom tools, skills, and ask_question requests', async () => {
    mockEveFetch({
      streams: [
        [
          sessionStartedEvent(),
          {
            type: 'actions.requested',
            data: {
              actions: [
                {
                  kind: 'tool-call',
                  callId: 'call-1',
                  toolName: 'ask_question',
                  input: { question: 'Proceed?' },
                },
              ],
              sequence: 1,
              stepIndex: 0,
              turnId: 'turn-1',
            },
          },
        ],
        [
          sessionStartedEvent(),
          {
            type: 'input.requested',
            data: {
              requests: [
                {
                  action: {
                    kind: 'tool-call',
                    callId: 'call-1',
                    toolName: 'ask_question',
                    input: { question: 'Proceed?' },
                  },
                  display: 'select',
                  prompt: 'Proceed?',
                  requestId: 'question-1',
                },
              ],
              sequence: 1,
              stepIndex: 0,
              turnId: 'turn-1',
            },
          },
        ],
      ],
    });

    const harness = createEve({ url: 'https://eve.test' });
    await expect(
      harness.doStart({
        sessionId: 'session-1',
        sandboxSession: {} as never,
        sessionWorkDir: '/tmp/eve',
        skills: [{ name: 'skill', content: 'content' }] as never,
      }),
    ).rejects.toSatisfy(HarnessCapabilityUnsupportedError.isInstance);

    const session = await createStartedSession();
    await expect(
      session.doPromptTurn({
        prompt: 'hello',
        tools: [{ name: 'custom' }],
        emit: () => {},
      }),
    ).rejects.toSatisfy(HarnessCapabilityUnsupportedError.isInstance);

    const control = await session.doPromptTurn({
      prompt: 'ask',
      emit: () => {},
    });
    await expect(control.done).rejects.toSatisfy(
      HarnessCapabilityUnsupportedError.isInstance,
    );

    const next = await session.doPromptTurn({
      prompt: 'ask again',
      emit: () => {},
    });
    await expect(next.done).rejects.toSatisfy(
      HarnessCapabilityUnsupportedError.isInstance,
    );
  });
});

async function createStartedSession(
  options: {
    readonly continueFrom?: Parameters<
      ReturnType<typeof createEve>['doStart']
    >[0]['continueFrom'];
  } = {},
) {
  return await createEve({ url: 'https://eve.test', auth: 'none' }).doStart({
    sessionId: 'session-1',
    sandboxSession: {} as never,
    sessionWorkDir: '/tmp/eve',
    ...(options.continueFrom ? { continueFrom: options.continueFrom } : {}),
  });
}

function mockEveFetch({
  streams,
}: {
  readonly streams: ReadonlyArray<ReadonlyArray<Record<string, unknown>>>;
}): {
  readonly postBodies: Array<Record<string, unknown>>;
} {
  const postBodies: Array<Record<string, unknown>> = [];
  const remainingStreams = [...streams];

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname === '/eve/v1/info') {
        return jsonResponse(createAgentInfo());
      }
      if (
        init?.method === 'POST' &&
        (url.pathname === '/eve/v1/session' ||
          url.pathname === '/eve/v1/session/eve-session-1')
      ) {
        postBodies.push(init.body == null ? {} : JSON.parse(String(init.body)));
        return jsonResponse({
          sessionId: 'eve-session-1',
          continuationToken: `continuation-${postBodies.length}`,
        });
      }
      if (url.pathname === '/eve/v1/session/eve-session-1/stream') {
        const events = remainingStreams.shift() ?? [];
        return new Response(
          events.map(event => JSON.stringify(event)).join('\n'),
        );
      }
      return new Response(`Unhandled ${url.pathname}`, { status: 404 });
    }),
  );

  return { postBodies };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
  });
}

function sessionStartedEvent(): Record<string, unknown> {
  return {
    type: 'session.started',
    data: {
      runtime: {
        agentId: 'agent-1',
        agentName: 'Eve test agent',
        eveVersion: '0.17.1',
        modelId: 'anthropic/claude-sonnet-4-6',
      },
    },
  };
}

function createAgentInfo(): Record<string, unknown> {
  return {
    agent: {
      agentRoot: '/agent',
      appRoot: '/app',
      model: {
        id: 'anthropic/claude-sonnet-4-6',
      },
      name: 'Eve test agent',
    },
    capabilities: { devRoutes: false },
    channels: {
      authored: [],
      available: [],
      disabledFramework: [],
      framework: [],
    },
    connections: [],
    diagnostics: {
      discoveryErrors: 0,
      discoveryWarnings: 0,
    },
    hooks: [],
    instructions: {
      dynamic: [],
      static: null,
    },
    kind: 'eve-agent-info',
    mode: 'production',
    sandbox: null,
    schedules: [],
    skills: {
      dynamic: [],
      static: [],
    },
    subagents: {
      local: [],
      total: 0,
    },
    tools: {
      authored: [],
      available: [],
      disabledFramework: [],
      dynamic: [],
      framework: [],
      reserved: [],
    },
    version: 1,
    workflow: {
      enabled: true,
      toolName: 'agent',
    },
    workspace: {
      resourceRoot: null,
      rootEntries: [],
    },
  };
}
