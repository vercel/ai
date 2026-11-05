import type { SessionUpdate } from '@agentclientprotocol/sdk';
import type { HarnessV1StreamPart } from '@ai-sdk/harness';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ACPToolCall } from '../../acp-tool-call';
import { createEmitStreamEvent } from './create-emit-stream-event';

describe('ACP built-in tool approval input', () => {
  const input = {
    command: "echo 'Tool approval succeeded.' > approval-example.txt",
  };
  let emitter: ReturnType<typeof createEmitStreamEvent>;
  let events: HarnessV1StreamPart[];
  let candidates: ACPToolCall[];

  function observe(update: SessionUpdate) {
    emitter.message({
      message: {
        kind: 'session_update',
        notification: { sessionId: 'session-1', update },
        update,
      },
    });
  }

  beforeEach(() => {
    vi.useFakeTimers();
    events = [];
    candidates = [];
    emitter = createEmitStreamEvent({
      emit: event => events.push(event),
      emitToolCallCandidate: ({ toolCall }) => candidates.push(toolCall),
      builtinTools: [
        {
          toolName: 'bash',
          nativeName: 'shellToolCall',
          title: 'Terminal',
          toolUseKind: 'bash',
          inputSchema: {
            type: 'object',
            properties: { command: { type: 'string' } },
            required: ['command'],
          },
        },
      ],
      hostToolServerName: 'ai-sdk-harness-tools',
      hostTools: [],
      hostToolCallResolver: {
        getResolution: vi.fn().mockResolvedValue(undefined),
        resolveToolCall: vi.fn().mockResolvedValue(undefined),
      },
    });
    observe({
      sessionUpdate: 'tool_call',
      toolCallId: 'call-1',
      title: 'Terminal',
      kind: 'execute',
      status: 'pending',
      rawInput: {},
    });
    observe({
      sessionUpdate: 'tool_call_update',
      toolCallId: 'call-1',
      title: `\`${input.command}\``,
      rawInput: input,
    });
    observe({
      sessionUpdate: 'tool_call_update',
      toolCallId: 'call-1',
      status: 'in_progress',
    });
  });

  afterEach(() => {
    emitter.close();
    vi.useRealTimers();
  });

  it.each([0, 1000])(
    'recovers missing input with a %i ms delay without duplicate calls',
    async delay => {
      await vi.advanceTimersByTimeAsync(delay);
      emitter.permissionToolCall({
        toolCall: { toolCallId: 'call-1', kind: 'execute' },
      });
      await vi.advanceTimersByTimeAsync(1000);
      expect(events.filter(event => event.type === 'tool-call'))
        .toMatchInlineSnapshot(`
          [
            {
              "input": "{"command":"echo 'Tool approval succeeded.' > approval-example.txt"}",
              "nativeName": "shellToolCall",
              "providerExecuted": true,
              "toolCallId": "call-1",
              "toolName": "bash",
              "type": "tool-call",
            },
          ]
        `);
    },
  );

  it.each([null, {}, { command: 'replacement' }, ['explicit'], 'explicit'])(
    'preserves explicit permission input %j',
    rawInput => {
      emitter.permissionToolCall({
        toolCall: { toolCallId: 'call-1', rawInput },
      });
      expect(candidates[0].rawInput).toEqual(rawInput);
      const call = events.find(event => event.type === 'tool-call');
      expect(call?.input).toBe(JSON.stringify(rawInput ?? {}));
    },
  );

  it('does not reuse input from another tool call', () => {
    observe({
      sessionUpdate: 'tool_call',
      toolCallId: 'call-2',
      title: 'Terminal',
      status: 'pending',
      rawInput: { command: 'second' },
    });
    for (const toolCallId of ['call-2', 'call-1', 'unobserved']) {
      emitter.permissionToolCall({ toolCall: { toolCallId } });
    }
    expect(candidates.map(({ rawInput }) => rawInput)).toEqual([
      { command: 'second' },
      input,
      undefined,
    ]);
  });

  it('does not restore identity or metadata explicitly cleared by the permission', () => {
    observe({
      sessionUpdate: 'tool_call_update',
      toolCallId: 'call-1',
      _meta: { name: 'bash' },
    });
    emitter.permissionToolCall({
      toolCall: {
        toolCallId: 'call-1',
        title: null,
        kind: null,
        _meta: null,
        rawInput: null,
      },
    });
    expect(candidates).toEqual([
      {
        toolCallId: 'call-1',
        title: 'Tool call-1',
        _meta: null,
        rawInput: null,
      },
    ]);
  });
});
