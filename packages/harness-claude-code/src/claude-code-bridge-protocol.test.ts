import { describe, expect, it } from 'vitest';
import {
  bridgeReadySchema,
  inboundMessageSchema,
  outboundMessageSchema,
} from './claude-code-bridge-protocol';

describe('outboundMessageSchema', () => {
  const usage = {
    inputTokens: { total: 0, noCache: 0 },
    outputTokens: { total: 0, text: 0 },
  };
  const cases = [
    { type: 'stream-start' },
    { type: 'text-start', id: 'x' },
    { type: 'text-delta', id: 'x', delta: 'hi' },
    { type: 'text-end', id: 'x' },
    { type: 'reasoning-start', id: 'r' },
    { type: 'reasoning-delta', id: 'r', delta: 'thinking' },
    { type: 'reasoning-end', id: 'r' },
    {
      type: 'tool-input-start',
      id: 't1',
      toolName: 'bash',
      providerExecuted: true,
    },
    {
      type: 'tool-input-delta',
      id: 't1',
      delta: '{"command":"ls"}',
    },
    { type: 'tool-input-end', id: 't1' },
    {
      type: 'tool-call',
      toolCallId: 't1',
      toolName: 'bash',
      input: '{"command":"ls"}',
      nativeName: 'Bash',
      providerExecuted: true,
    },
    {
      type: 'tool-result',
      toolCallId: 't1',
      toolName: 'bash',
      result: { exitCode: 0, output: 'ok' },
    },
    {
      type: 'finish-step',
      finishReason: { unified: 'stop', raw: 'stop' },
      usage,
    },
    {
      type: 'finish',
      finishReason: { unified: 'stop', raw: 'stop' },
      totalUsage: usage,
    },
    { type: 'error', error: 'boom' },
    { type: 'raw', rawValue: { hello: 'world' } },
    {
      type: 'raw',
      rawValue: {
        type: 'stream_event',
        event: { type: 'message_stop' },
        usage: { input_tokens: 1, output_tokens: 2 },
      },
    },
  ];

  for (const sample of cases) {
    it(`accepts ${sample.type}`, () => {
      expect(() => outboundMessageSchema.parse(sample)).not.toThrow();
    });
  }

  it('rejects unknown types', () => {
    expect(() =>
      outboundMessageSchema.parse({ type: 'mystery' as 'error', error: 1 }),
    ).toThrow();
  });

  it('preserves structured Claude Code tool results', () => {
    const message = {
      type: 'tool-result' as const,
      toolCallId: 't1',
      toolName: 'TaskCreate',
      result: { task: { id: '1', subject: 'probe-task' } },
    };

    expect(outboundMessageSchema.parse(message)).toEqual(message);
  });
});

describe('inboundMessageSchema', () => {
  it('keeps the question timeout and excludeDynamicSections on a start message', () => {
    expect(
      inboundMessageSchema.parse({
        type: 'start',
        prompt: 'hi',
        tools: [],
        thinking: { type: 'adaptive', display: 'summarized' },
        questionTimeoutMs: 600_000,
        excludeDynamicSections: true,
      }),
    ).toMatchObject({
      questionTimeoutMs: 600_000,
      excludeDynamicSections: true,
    });
  });

  it('keeps strict MCP config and the budget limit on a start message', () => {
    expect(
      inboundMessageSchema.parse({
        type: 'start',
        prompt: 'hi',
        tools: [],
        thinking: { type: 'adaptive', display: 'summarized' },
        strictMcpConfig: true,
        maxBudgetUsd: 0.5,
      }),
    ).toMatchObject({
      strictMcpConfig: true,
      maxBudgetUsd: 0.5,
    });
  });

  it('accepts a start message', () => {
    expect(() =>
      inboundMessageSchema.parse({
        type: 'start',
        prompt: 'hi',
        instructions: 'Be concise.',
        tools: [{ name: 'deploy' }],
        model: 'claude-sonnet-4-5',
        maxTurns: 5,
        agentProgressSummaries: true,
        forwardSubagentText: true,
        env: { DEPLOYMENT_ENV: 'staging' },
        thinking: { type: 'adaptive', display: 'summarized' },
        skills: ['weather-forecast', 'weather-codes'],
        permissionMode: 'allow-edits',
        builtinToolFiltering: { mode: 'deny', toolNames: ['bash'] },
      }),
    ).not.toThrow();
  });

  it('accepts a start message with text and image prompt content', () => {
    expect(() =>
      inboundMessageSchema.parse({
        type: 'start',
        prompt: [
          { type: 'text', text: 'What is in this image?' },
          { type: 'image', mediaType: 'image/png', data: 'iVBORw0KGgo=' },
        ],
        thinking: { type: 'disabled' },
      }),
    ).not.toThrow();
  });

  it('accepts a start message naming the exact conversation to resume', () => {
    expect(() =>
      inboundMessageSchema.parse({
        type: 'start',
        prompt: 'hi',
        thinking: { type: 'disabled' },
        resumeSessionId: 'claude-session-1',
      }),
    ).not.toThrow();
  });

  it('preserves skill overrides', () => {
    const message = {
      type: 'start' as const,
      prompt: 'hi',
      thinking: { type: 'disabled' as const },
      skillOverrides: {
        'enabled-skill': 'on',
        'name-only-skill': 'name-only',
        'user-invocable-skill': 'user-invocable-only',
        'disabled-skill': 'off',
      },
    };

    expect(inboundMessageSchema.parse(message)).toEqual(message);
  });

  it('rejects unsupported skill override modes', () => {
    expect(() =>
      inboundMessageSchema.parse({
        type: 'start',
        prompt: 'hi',
        thinking: { type: 'disabled' },
        skillOverrides: { init: 'disabled' },
      }),
    ).toThrow();
  });

  it('does not preserve arbitrary native settings', () => {
    const parsed = inboundMessageSchema.parse({
      type: 'start',
      prompt: 'hi',
      thinking: { type: 'disabled' },
      settings: { permissions: { defaultMode: 'bypassPermissions' } },
    });

    expect(parsed).not.toHaveProperty('settings');
  });

  it('rejects a non-string resumeSessionId', () => {
    expect(() =>
      inboundMessageSchema.parse({
        type: 'start',
        prompt: 'hi',
        thinking: { type: 'disabled' },
        resumeSessionId: 7,
      }),
    ).toThrow();
  });

  it('rejects non-string environment values', () => {
    expect(() =>
      inboundMessageSchema.parse({
        type: 'start',
        prompt: 'hi',
        thinking: { type: 'disabled' },
        env: { RETRY_COUNT: 3 },
      }),
    ).toThrow();
  });

  it('rejects legacy string thinking values', () => {
    expect(() =>
      inboundMessageSchema.parse({
        type: 'start',
        prompt: 'hi',
        thinking: 'adaptive',
      }),
    ).toThrow();
  });

  it('accepts a tool-result message', () => {
    expect(() =>
      inboundMessageSchema.parse({
        type: 'tool-result',
        toolCallId: 't1',
        output: { ok: true },
      }),
    ).not.toThrow();
  });

  it('accepts a tool-approval-response message', () => {
    expect(() =>
      inboundMessageSchema.parse({
        type: 'tool-approval-response',
        approvalId: 'a1',
        approved: true,
      }),
    ).not.toThrow();
  });

  it('accepts user-message, abort, stop, and destroy', () => {
    for (const sample of [
      { type: 'user-message', messageId: 'message-1', text: 'hi' },
      { type: 'abort' },
      { type: 'stop' },
      { type: 'destroy' },
    ]) {
      expect(() => inboundMessageSchema.parse(sample)).not.toThrow();
    }
  });
});

describe('bridgeReadySchema', () => {
  it('accepts the ready handshake', () => {
    expect(() =>
      bridgeReadySchema.parse({
        type: 'bridge-ready',
        port: 12345,
      }),
    ).not.toThrow();
  });

  it('rejects a non-ready type', () => {
    expect(() =>
      bridgeReadySchema.parse({
        type: 'nope',
        port: 12345,
      }),
    ).toThrow();
  });
});
