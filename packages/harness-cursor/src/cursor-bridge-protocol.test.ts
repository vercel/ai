import { describe, expect, it } from 'vitest';
import {
  bridgeReadySchema,
  inboundMessageSchema,
  outboundMessageSchema,
} from './cursor-bridge-protocol';

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
      type: 'tool-call',
      toolCallId: 't1',
      toolName: 'bash',
      input: '{"command":"ls"}',
      nativeName: 'shell',
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
  ];

  for (const sample of cases) {
    it(`accepts ${sample.type}`, () => {
      expect(() => outboundMessageSchema.parse(sample)).not.toThrow();
    });
  }
});

describe('inboundMessageSchema', () => {
  it('accepts a start message with cursor fields', () => {
    expect(() =>
      inboundMessageSchema.parse({
        type: 'start',
        prompt: 'hi',
        tools: [{ name: 'deploy' }],
        model: 'composer-2.5',
        resumeAgentId: 'agent-abc',
        autoReview: true,
      }),
    ).not.toThrow();
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
});

describe('bridgeReadySchema', () => {
  it('accepts bridge-ready', () => {
    expect(() =>
      bridgeReadySchema.parse({ type: 'bridge-ready', port: 4317 }),
    ).not.toThrow();
  });
});
