import type { ApiEvent } from '@1jehuang/jcode-sdk';
import type { HarnessV1StreamPart } from '@ai-sdk/harness';
import { describe, expect, it } from 'vitest';
import {
  createJcodeTranslatorState,
  translateJcodeEvent,
} from './jcode-translate';

function translate(
  events: readonly ApiEvent[],
  turnId: string | number = 1,
): HarnessV1StreamPart[] {
  const state = createJcodeTranslatorState(turnId);
  return events.flatMap(event => translateJcodeEvent(event, state));
}

describe('translateJcodeEvent', () => {
  it('frames interleaved reasoning and text deltas with stable per-turn ids', () => {
    const events: ApiEvent[] = [
      { ev: 'reasoning_delta', session_id: 's', text: 'think ' },
      { ev: 'reasoning_delta', session_id: 's', text: 'more' },
      { ev: 'reasoning_done', session_id: 's', duration_secs: 1.5 },
      { ev: 'text_delta', session_id: 's', text: 'Hello' },
      { ev: 'text_delta', session_id: 's', text: ' world' },
      { ev: 'reasoning_delta', session_id: 's', text: 'check' },
      { ev: 'text_delta', session_id: 's', text: 'Done' },
      { ev: 'turn_done', session_id: 's' },
    ];

    expect(translate(events, 'abc')).toEqual([
      { type: 'reasoning-start', id: 'jcode-turn-abc-reasoning-1' },
      {
        type: 'reasoning-delta',
        id: 'jcode-turn-abc-reasoning-1',
        delta: 'think ',
      },
      {
        type: 'reasoning-delta',
        id: 'jcode-turn-abc-reasoning-1',
        delta: 'more',
      },
      { type: 'reasoning-end', id: 'jcode-turn-abc-reasoning-1' },
      { type: 'text-start', id: 'jcode-turn-abc-text-2' },
      { type: 'text-delta', id: 'jcode-turn-abc-text-2', delta: 'Hello' },
      {
        type: 'text-delta',
        id: 'jcode-turn-abc-text-2',
        delta: ' world',
      },
      { type: 'text-end', id: 'jcode-turn-abc-text-2' },
      { type: 'reasoning-start', id: 'jcode-turn-abc-reasoning-3' },
      {
        type: 'reasoning-delta',
        id: 'jcode-turn-abc-reasoning-3',
        delta: 'check',
      },
      { type: 'reasoning-end', id: 'jcode-turn-abc-reasoning-3' },
      { type: 'text-start', id: 'jcode-turn-abc-text-4' },
      { type: 'text-delta', id: 'jcode-turn-abc-text-4', delta: 'Done' },
      { type: 'text-end', id: 'jcode-turn-abc-text-4' },
      {
        type: 'finish',
        finishReason: { unified: 'stop', raw: 'turn_done' },
        totalUsage: {
          inputTokens: {
            total: 0,
            noCache: 0,
            cacheRead: 0,
            cacheWrite: 0,
          },
          outputTokens: { total: 0, text: 0, reasoning: 0 },
        },
      },
    ] satisfies HarnessV1StreamPart[]);
  });

  it('accumulates incremental JSON input and emits a provider-executed tool call before its result', () => {
    const events: ApiEvent[] = [
      { ev: 'text_delta', session_id: 's', text: 'I will read it.' },
      { ev: 'tool_start', session_id: 's', call_id: 'call-1', name: 'read' },
      {
        ev: 'tool_input_delta',
        session_id: 's',
        call_id: 'call-1',
        delta: '{"file_',
      },
      {
        ev: 'tool_input_delta',
        session_id: 's',
        call_id: 'call-1',
        delta: 'path":"a.txt"}',
      },
      { ev: 'tool_exec', session_id: 's', call_id: 'call-1', name: 'read' },
      {
        ev: 'tool_done',
        session_id: 's',
        call_id: 'call-1',
        name: 'read',
        output: 'contents',
      },
    ];

    expect(translate(events)).toEqual([
      { type: 'text-start', id: 'jcode-turn-1-text-1' },
      {
        type: 'text-delta',
        id: 'jcode-turn-1-text-1',
        delta: 'I will read it.',
      },
      { type: 'text-end', id: 'jcode-turn-1-text-1' },
      {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'read',
        input: '{"file_path":"a.txt"}',
        providerExecuted: true,
        dynamic: true,
      },
      {
        type: 'tool-result',
        toolCallId: 'call-1',
        toolName: 'read',
        result: 'contents',
      },
    ] satisfies HarnessV1StreamPart[]);
  });

  it('fills missing tool lifecycle events, defaults empty input, and marks failures', () => {
    const events: ApiEvent[] = [
      {
        ev: 'tool_done',
        session_id: 's',
        call_id: 'call-2',
        name: 'bash',
        output: 'stderr',
        error: 'exit 1',
      },
    ];

    expect(translate(events)).toEqual([
      {
        type: 'tool-call',
        toolCallId: 'call-2',
        toolName: 'bash',
        input: '{}',
        providerExecuted: true,
        dynamic: true,
      },
      {
        type: 'tool-result',
        toolCallId: 'call-2',
        toolName: 'bash',
        result: 'exit 1',
        isError: true,
      },
    ] satisfies HarnessV1StreamPart[]);
  });

  it('emits step usage, infers finish reasons, and aggregates known turn usage', () => {
    const events: ApiEvent[] = [
      { ev: 'tool_start', session_id: 's', call_id: 'c', name: 'ls' },
      { ev: 'tool_exec', session_id: 's', call_id: 'c', name: 'ls' },
      {
        ev: 'token_usage',
        session_id: 's',
        input: 100,
        output: 20,
        cache_read_input: 40,
      },
      { ev: 'text_delta', session_id: 's', text: 'finished' },
      { ev: 'token_usage', session_id: 's', input: 12, output: 3 },
      { ev: 'turn_done', session_id: 's' },
    ];

    expect(translate(events)).toEqual([
      {
        type: 'tool-call',
        toolCallId: 'c',
        toolName: 'ls',
        input: '{}',
        providerExecuted: true,
        dynamic: true,
      },
      {
        type: 'finish-step',
        finishReason: { unified: 'tool-calls', raw: 'tool-calls' },
        usage: {
          inputTokens: {
            total: 100,
            noCache: 60,
            cacheRead: 40,
            cacheWrite: 0,
          },
          outputTokens: {
            total: 20,
            text: undefined,
            reasoning: undefined,
          },
        },
      },
      { type: 'text-start', id: 'jcode-turn-1-text-1' },
      { type: 'text-delta', id: 'jcode-turn-1-text-1', delta: 'finished' },
      { type: 'text-end', id: 'jcode-turn-1-text-1' },
      {
        type: 'finish-step',
        finishReason: { unified: 'stop', raw: 'stop' },
        usage: {
          inputTokens: {
            total: 12,
            noCache: 12,
            cacheRead: 0,
            cacheWrite: 0,
          },
          outputTokens: {
            total: 3,
            text: undefined,
            reasoning: undefined,
          },
        },
      },
      {
        type: 'finish',
        finishReason: { unified: 'stop', raw: 'turn_done' },
        totalUsage: {
          inputTokens: {
            total: 112,
            noCache: 72,
            cacheRead: 40,
            cacheWrite: 0,
          },
          outputTokens: {
            total: 23,
            text: undefined,
            reasoning: undefined,
          },
        },
      },
    ] satisfies HarnessV1StreamPart[]);
  });

  it('maps compaction, protocol errors, and otherwise unhandled events', () => {
    const events: ApiEvent[] = [
      { ev: 'reasoning_delta', session_id: 's', text: 'old context' },
      { ev: 'compacted', session_id: 's', message: 'summary' },
      { ev: 'error', code: 'internal', message: 'broken' },
      { ev: 'session_status', session_id: 's', status: 'idle' },
    ];

    expect(translate(events)).toEqual([
      { type: 'reasoning-start', id: 'jcode-turn-1-reasoning-1' },
      {
        type: 'reasoning-delta',
        id: 'jcode-turn-1-reasoning-1',
        delta: 'old context',
      },
      { type: 'reasoning-end', id: 'jcode-turn-1-reasoning-1' },
      { type: 'compaction', trigger: 'auto', summary: 'summary' },
      {
        type: 'error',
        error: { ev: 'error', code: 'internal', message: 'broken' },
      },
      {
        type: 'raw',
        rawValue: { ev: 'session_status', session_id: 's', status: 'idle' },
      },
    ] satisfies HarnessV1StreamPart[]);
  });
});
