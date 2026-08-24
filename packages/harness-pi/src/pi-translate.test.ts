import { describe, expect, it } from 'vitest';
import type { PiSessionEvent } from './pi-events';
import {
  createPiTranslatorState,
  finishPiApprovalStep,
  translatePiEvent,
  type PiTranslatorState,
} from './pi-translate';

function emit(events: PiSessionEvent[], state: PiTranslatorState) {
  return events.flatMap(e => translatePiEvent(e, state));
}

describe('translatePiEvent', () => {
  it('drops events before turn_start', () => {
    const state = createPiTranslatorState();
    const out = translatePiEvent(
      {
        type: 'message_update',
        assistantMessageEvent: { type: 'text_delta', delta: 'hi' },
      } as PiSessionEvent,
      state,
    );
    expect(out).toEqual([]);
  });

  it('emits text-start before the first text-delta', () => {
    const state = createPiTranslatorState();
    const out = emit(
      [
        { type: 'turn_start' } as PiSessionEvent,
        {
          type: 'message_update',
          assistantMessageEvent: { type: 'text_delta', delta: 'Hello ' },
        } as PiSessionEvent,
        {
          type: 'message_update',
          assistantMessageEvent: { type: 'text_delta', delta: 'world' },
        } as PiSessionEvent,
      ],
      state,
    );
    expect(out[0]?.type).toBe('text-start');
    const id = (out[0] as { id: string }).id;
    expect(out[1]).toMatchObject({ type: 'text-delta', id, delta: 'Hello ' });
    expect(out[2]).toMatchObject({ type: 'text-delta', id, delta: 'world' });
  });

  it('gap-fills missing text at turn_end and emits text-end', () => {
    const state = createPiTranslatorState();
    emit(
      [
        { type: 'turn_start' } as PiSessionEvent,
        {
          type: 'message_update',
          assistantMessageEvent: { type: 'text_delta', delta: 'partial' },
        } as PiSessionEvent,
      ],
      state,
    );
    const closing = translatePiEvent(
      {
        type: 'turn_end',
        message: { role: 'assistant', content: 'partial and more' },
      } as PiSessionEvent,
      state,
    );
    // gap-fill delta then text-end
    expect(closing[0]).toMatchObject({
      type: 'text-delta',
      delta: ' and more',
    });
    expect(closing[1]?.type).toBe('text-end');
  });

  it('emits text-end without gap-fill when nothing is missing', () => {
    const state = createPiTranslatorState();
    emit(
      [
        { type: 'turn_start' } as PiSessionEvent,
        {
          type: 'message_update',
          assistantMessageEvent: { type: 'text_delta', delta: 'complete' },
        } as PiSessionEvent,
      ],
      state,
    );
    const closing = translatePiEvent(
      {
        type: 'message_end',
        message: { role: 'assistant', content: 'complete' },
      } as PiSessionEvent,
      state,
    );
    expect(closing.find(p => p.type === 'text-delta')).toBeUndefined();
    expect(closing.find(p => p.type === 'text-end')).toBeDefined();
  });

  it('emits finish-step at turn_end when the assistant requested no tools', () => {
    const state = createPiTranslatorState();
    emit(
      [
        { type: 'turn_start' } as PiSessionEvent,
        {
          type: 'message_start',
          message: { role: 'assistant', content: [] },
        } as PiSessionEvent,
        {
          type: 'message_update',
          assistantMessageEvent: { type: 'text_delta', delta: 'done' },
        } as PiSessionEvent,
      ],
      state,
    );

    const closing = translatePiEvent(
      {
        type: 'message_end',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'done' }],
        },
      } as PiSessionEvent,
      state,
    );

    expect(closing.map(p => p.type)).toEqual(['text-end']);

    const turnEnd = translatePiEvent(
      { type: 'turn_end' } as PiSessionEvent,
      state,
    );

    expect(turnEnd.map(p => p.type)).toEqual(['finish-step']);
  });

  it('waits for requested tool executions before emitting finish-step', () => {
    const state = createPiTranslatorState({ builtinToolNames: ['bash'] });
    emit(
      [
        { type: 'turn_start' } as PiSessionEvent,
        {
          type: 'message_start',
          message: { role: 'assistant', content: [] },
        } as PiSessionEvent,
        {
          type: 'message_end',
          message: {
            role: 'assistant',
            content: [{ type: 'toolCall', id: 'c-step', name: 'bash' }],
          },
        } as PiSessionEvent,
      ],
      state,
    );

    const start = translatePiEvent(
      {
        type: 'tool_execution_start',
        toolCallId: 'c-step',
        toolName: 'bash',
        args: { command: 'pwd' },
      } as PiSessionEvent,
      state,
    );
    const end = translatePiEvent(
      {
        type: 'tool_execution_end',
        toolCallId: 'c-step',
        result: 'ok',
      } as PiSessionEvent,
      state,
    );

    expect(start.map(p => p.type)).toEqual(['tool-call']);
    expect(end.map(p => p.type)).toEqual(['tool-result', 'finish-step']);
  });

  it('reports the step tool-call count on every tool-call of the step', () => {
    const state = createPiTranslatorState();
    emit(
      [
        { type: 'turn_start' } as PiSessionEvent,
        {
          type: 'message_start',
          message: { role: 'assistant', content: [] },
        } as PiSessionEvent,
        {
          type: 'message_end',
          message: {
            role: 'assistant',
            content: [
              { type: 'toolCall', id: 'call-1', name: 'create_suite' },
              { type: 'toolCall', id: 'call-2', name: 'create_suite' },
            ],
          },
        } as PiSessionEvent,
      ],
      state,
    );

    const starts = emit(
      [
        {
          type: 'tool_execution_start',
          toolCallId: 'call-1',
          toolName: 'create_suite',
          args: { name: 'A' },
        } as PiSessionEvent,
        {
          type: 'tool_execution_start',
          toolCallId: 'call-2',
          toolName: 'create_suite',
          args: { name: 'B' },
        } as PiSessionEvent,
      ],
      state,
    );

    expect(
      starts.map(part =>
        part.type === 'tool-call'
          ? { toolCallId: part.toolCallId, count: part.stepToolCallCount }
          : part.type,
      ),
    ).toEqual([
      { toolCallId: 'call-1', count: 2 },
      { toolCallId: 'call-2', count: 2 },
    ]);
  });

  it('omits the step tool-call count when the step has no tool calls', () => {
    const state = createPiTranslatorState();
    emit(
      [
        { type: 'turn_start' } as PiSessionEvent,
        {
          type: 'message_start',
          message: { role: 'assistant', content: [] },
        } as PiSessionEvent,
        {
          type: 'message_end',
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'k' }],
          },
        } as PiSessionEvent,
      ],
      state,
    );

    const start = translatePiEvent(
      {
        type: 'tool_execution_start',
        toolCallId: 'orphan',
        toolName: 'create_suite',
        args: {},
      } as PiSessionEvent,
      state,
    );

    expect(start).toEqual([
      {
        type: 'tool-call',
        toolCallId: 'orphan',
        toolName: 'create_suite',
        input: '{}',
      },
    ]);
  });

  it('emits finish-step after a built-in approval request pauses the step', () => {
    const state = createPiTranslatorState();
    emit(
      [
        { type: 'turn_start' } as PiSessionEvent,
        {
          type: 'message_start',
          message: { role: 'assistant', content: [] },
        } as PiSessionEvent,
        {
          type: 'message_end',
          message: {
            role: 'assistant',
            content: [{ type: 'toolCall', id: 'approval-1', name: 'write' }],
          },
        } as PiSessionEvent,
      ],
      state,
    );

    expect(finishPiApprovalStep(state, 'approval-1').map(p => p.type)).toEqual([
      'finish-step',
    ]);
  });

  it('emits reasoning-start lazily on first thinking_delta', () => {
    const state = createPiTranslatorState();
    const out = emit(
      [
        { type: 'turn_start' } as PiSessionEvent,
        {
          type: 'message_update',
          assistantMessageEvent: {
            type: 'thinking_delta',
            delta: 'pondering...',
          },
        } as PiSessionEvent,
      ],
      state,
    );
    expect(out[0]?.type).toBe('reasoning-start');
    expect(out[1]).toMatchObject({
      type: 'reasoning-delta',
      delta: 'pondering...',
    });
  });

  it('emits reasoning-end on turn_end if reasoning was started', () => {
    const state = createPiTranslatorState();
    emit(
      [
        { type: 'turn_start' } as PiSessionEvent,
        {
          type: 'message_update',
          assistantMessageEvent: { type: 'thinking_delta', delta: 'think' },
        } as PiSessionEvent,
      ],
      state,
    );
    const closing = translatePiEvent(
      {
        type: 'turn_end',
        message: { role: 'assistant', content: '' },
      } as PiSessionEvent,
      state,
    );
    expect(closing.find(p => p.type === 'reasoning-end')).toBeDefined();
  });

  it('emits tool-call with providerExecuted=true for builtin tools', () => {
    const state = createPiTranslatorState({
      builtinToolNames: ['bash'],
    });
    emit([{ type: 'turn_start' } as PiSessionEvent], state);
    const out = translatePiEvent(
      {
        type: 'tool_execution_start',
        toolCallId: 'call_1',
        toolName: 'bash',
        args: { command: 'ls' },
      } as PiSessionEvent,
      state,
    );
    expect(out[0]).toMatchObject({
      type: 'tool-call',
      toolCallId: 'call_1',
      toolName: 'bash',
      input: JSON.stringify({ command: 'ls' }),
      providerExecuted: true,
    });
  });

  it('uses common name as wire toolName when nativeToCommon contains it', () => {
    const state = createPiTranslatorState({
      builtinToolNames: ['find'],
      nativeToCommon: { find: 'glob' },
    });
    emit([{ type: 'turn_start' } as PiSessionEvent], state);
    const out = translatePiEvent(
      {
        type: 'tool_execution_start',
        toolCallId: 'c2',
        toolName: 'find',
        args: { pattern: '*.ts' },
      } as PiSessionEvent,
      state,
    );
    expect(out[0]).toMatchObject({
      type: 'tool-call',
      toolName: 'glob',
      nativeName: 'find',
      providerExecuted: true,
    });
  });

  it('emits tool-call with providerExecuted unset for user-registered tools', () => {
    const state = createPiTranslatorState({ builtinToolNames: ['bash'] });
    emit([{ type: 'turn_start' } as PiSessionEvent], state);
    const out = translatePiEvent(
      {
        type: 'tool_execution_start',
        toolCallId: 'c3',
        toolName: 'deploy',
        args: { env: 'staging' },
      } as PiSessionEvent,
      state,
    );
    const part = out[0] as { providerExecuted?: boolean };
    expect(part.providerExecuted).toBeUndefined();
  });

  it('marks MCP-prefixed tool calls and results as dynamic and parses JSON results', () => {
    const state = createPiTranslatorState();
    emit([{ type: 'turn_start' } as PiSessionEvent], state);

    const call = translatePiEvent(
      {
        type: 'tool_execution_start',
        toolCallId: 'mcp-call',
        toolName: 'mcp__memory_search',
        args: { query: 'AI SDK' },
      } as PiSessionEvent,
      state,
    );
    const result = translatePiEvent(
      {
        type: 'tool_execution_end',
        toolCallId: 'mcp-call',
        result: {
          content: [
            {
              type: 'text',
              text: '{"matches":["AI SDK Core","AI SDK UI"]}',
            },
          ],
        },
      } as PiSessionEvent,
      state,
    );

    expect([call[0], result[0]]).toMatchInlineSnapshot(`
      [
        {
          "dynamic": true,
          "input": "{\"query\":\"AI SDK\"}",
          "providerExecuted": true,
          "toolCallId": "mcp-call",
          "toolName": "mcp__memory_search",
          "type": "tool-call",
        },
        {
          "dynamic": true,
          "result": {
            "matches": [
              "AI SDK Core",
              "AI SDK UI",
            ],
          },
          "toolCallId": "mcp-call",
          "toolName": "mcp__memory_search",
          "type": "tool-result",
        },
      ]
    `);
  });

  it('keeps non-JSON MCP results and JSON native results as text', () => {
    const state = createPiTranslatorState({ builtinToolNames: ['read'] });
    emit([{ type: 'turn_start' } as PiSessionEvent], state);

    emit(
      [
        {
          type: 'tool_execution_start',
          toolCallId: 'mcp-call',
          toolName: 'mcp__memory_search',
          args: {},
        } as PiSessionEvent,
        {
          type: 'tool_execution_start',
          toolCallId: 'native-call',
          toolName: 'read',
          args: {},
        } as PiSessionEvent,
      ],
      state,
    );

    const mcpResult = translatePiEvent(
      {
        type: 'tool_execution_end',
        toolCallId: 'mcp-call',
        result: { content: [{ type: 'text', text: 'not JSON' }] },
      } as PiSessionEvent,
      state,
    );
    const nativeResult = translatePiEvent(
      {
        type: 'tool_execution_end',
        toolCallId: 'native-call',
        result: { content: [{ type: 'text', text: '{"path":"README.md"}' }] },
      } as PiSessionEvent,
      state,
    );

    expect([mcpResult[0], nativeResult[0]]).toMatchInlineSnapshot(`
      [
        {
          "dynamic": true,
          "result": "not JSON",
          "toolCallId": "mcp-call",
          "toolName": "mcp__memory_search",
          "type": "tool-result",
        },
        {
          "result": "{\"path\":\"README.md\"}",
          "toolCallId": "native-call",
          "toolName": "read",
          "type": "tool-result",
        },
      ]
    `);
  });

  it('keeps explicitly typed host tools static even with an MCP prefix', () => {
    const state = createPiTranslatorState({
      hostToolNames: ['mcp__custom_tool'],
    });
    emit([{ type: 'turn_start' } as PiSessionEvent], state);

    const out = translatePiEvent(
      {
        type: 'tool_execution_start',
        toolCallId: 'host-call',
        toolName: 'mcp__custom_tool',
        args: {},
      } as PiSessionEvent,
      state,
    );

    expect(out[0]).toMatchInlineSnapshot(`
      {
        "input": "{}",
        "toolCallId": "host-call",
        "toolName": "mcp__custom_tool",
        "type": "tool-call",
      }
    `);
  });

  it('correlates tool-result with the prior tool-call by id', () => {
    const state = createPiTranslatorState({
      builtinToolNames: ['bash'],
    });
    emit(
      [
        { type: 'turn_start' } as PiSessionEvent,
        {
          type: 'tool_execution_start',
          toolCallId: 'c4',
          toolName: 'bash',
          args: { command: 'echo' },
        } as PiSessionEvent,
      ],
      state,
    );
    const out = translatePiEvent(
      {
        type: 'tool_execution_end',
        toolCallId: 'c4',
        result: 'hello',
      } as PiSessionEvent,
      state,
    );
    expect(out[0]).toMatchObject({
      type: 'tool-result',
      toolCallId: 'c4',
      toolName: 'bash',
      result: 'hello',
    });
  });

  it('surfaces the original host-submitted output object instead of the echoed text', () => {
    const state = createPiTranslatorState();
    emit(
      [
        { type: 'turn_start' } as PiSessionEvent,
        {
          type: 'tool_execution_start',
          toolCallId: 'c6',
          toolName: 'weather',
          args: { city: 'SF' },
        } as PiSessionEvent,
      ],
      state,
    );

    // The session records the exact value the host submitted; Pi echoes only
    // the serialized text back on the result event.
    const submitted = { state: 'ready', temperature: 72, weather: 'sunny' };
    state.hostToolResults.set('c6', submitted);

    const out = translatePiEvent(
      {
        type: 'tool_execution_end',
        toolCallId: 'c6',
        result: {
          content: [{ type: 'text', text: JSON.stringify(submitted) }],
        },
      } as PiSessionEvent,
      state,
    );

    expect(out[0]).toMatchObject({
      type: 'tool-result',
      toolCallId: 'c6',
      toolName: 'weather',
      result: submitted,
    });
    // The stored value is consumed so it cannot leak into a later result.
    expect(state.hostToolResults.has('c6')).toBe(false);
  });

  it('marks tool-result as error when isError is true', () => {
    const state = createPiTranslatorState();
    emit(
      [
        { type: 'turn_start' } as PiSessionEvent,
        {
          type: 'tool_execution_start',
          toolCallId: 'c5',
          toolName: 'bash',
          args: {},
        } as PiSessionEvent,
      ],
      state,
    );
    const out = translatePiEvent(
      {
        type: 'tool_execution_end',
        toolCallId: 'c5',
        result: 'boom',
        isError: true,
      } as PiSessionEvent,
      state,
    );
    expect(out[0]).toMatchObject({ type: 'tool-result', isError: true });
  });

  it('drops unrecognised event types', () => {
    const state = createPiTranslatorState();
    emit([{ type: 'turn_start' } as PiSessionEvent], state);
    expect(
      translatePiEvent({ type: 'queue_update' } as PiSessionEvent, state),
    ).toEqual([]);
  });

  it('translates compaction_end into a compaction part (auto for threshold/overflow)', () => {
    const state = createPiTranslatorState();
    const out = translatePiEvent(
      {
        type: 'compaction_end',
        reason: 'threshold',
        aborted: false,
        result: { summary: 'Condensed history.', tokensBefore: 90000 },
      } as PiSessionEvent,
      state,
    );
    expect(out).toEqual([
      {
        type: 'compaction',
        trigger: 'auto',
        summary: 'Condensed history.',
        tokensBefore: 90000,
      },
    ]);
  });

  it('maps reason "manual" to trigger "manual"', () => {
    const state = createPiTranslatorState();
    const out = translatePiEvent(
      {
        type: 'compaction_end',
        reason: 'manual',
        aborted: false,
        result: { summary: 'Manual compaction.' },
      } as PiSessionEvent,
      state,
    );
    expect(out[0]).toEqual({
      type: 'compaction',
      trigger: 'manual',
      summary: 'Manual compaction.',
    });
  });

  it('drops aborted or result-less compaction_end events', () => {
    const state = createPiTranslatorState();
    expect(
      translatePiEvent(
        {
          type: 'compaction_end',
          reason: 'manual',
          aborted: true,
          result: { summary: 's' },
        } as PiSessionEvent,
        state,
      ),
    ).toEqual([]);
    expect(
      translatePiEvent(
        {
          type: 'compaction_end',
          reason: 'overflow',
          aborted: false,
        } as PiSessionEvent,
        state,
      ),
    ).toEqual([]);
  });

  it('emits with a placeholder summary when the result has no summary', () => {
    const state = createPiTranslatorState();
    const out = translatePiEvent(
      {
        type: 'compaction_end',
        reason: 'threshold',
        aborted: false,
        result: { tokensBefore: 50000 },
      } as PiSessionEvent,
      state,
    );
    expect(out).toEqual([
      {
        type: 'compaction',
        trigger: 'auto',
        summary: '(no summary provided)',
        tokensBefore: 50000,
      },
    ]);
  });
});
