import { describe, expect, it } from 'vitest';
import {
  createAcpStreamState,
  finishFromResult,
  mapAcpUpdate,
} from './grok-build-stream-map';

function run(updates: unknown[]) {
  const s = createAcpStreamState();
  return updates.flatMap(u => mapAcpUpdate(u, s));
}

describe('mapAcpUpdate', () => {
  it('maps thought chunks then message chunks into reasoning then text blocks', () => {
    const parts = run([
      {
        sessionUpdate: 'agent_thought_chunk',
        content: { type: 'text', text: 'think a' },
      },
      {
        sessionUpdate: 'agent_thought_chunk',
        content: { type: 'text', text: 'think b' },
      },
      {
        sessionUpdate: 'agent_message_chunk',
        content: { type: 'text', text: 'hello ' },
      },
      {
        sessionUpdate: 'agent_message_chunk',
        content: { type: 'text', text: 'world' },
      },
    ]);

    expect(parts.filter(p => p.type === 'stream-start')).toHaveLength(1);

    expect(parts.map(p => p.type)).toEqual([
      'stream-start',
      'reasoning-start',
      'reasoning-delta',
      'reasoning-delta',
      'reasoning-end',
      'text-start',
      'text-delta',
      'text-delta',
    ]);
  });

  it('closes the open text block on finish', () => {
    const s = createAcpStreamState();
    mapAcpUpdate(
      {
        sessionUpdate: 'agent_message_chunk',
        content: { type: 'text', text: 'hi' },
      },
      s,
    );
    const parts = finishFromResult({ stopReason: 'end_turn' }, s);
    expect(parts.map(p => p.type)).toEqual([
      'text-end',
      'finish-step',
      'finish',
    ]);
  });

  it('emits exactly one stream-start across many updates', () => {
    const parts = run([
      {
        sessionUpdate: 'agent_message_chunk',
        content: { type: 'text', text: 'a' },
      },
      {
        sessionUpdate: 'agent_message_chunk',
        content: { type: 'text', text: 'b' },
      },
    ]);
    expect(parts.filter(p => p.type === 'stream-start')).toHaveLength(1);
  });

  it('maps tool_call to a tool-call part with toolName, nativeName, input', () => {
    const parts = run([
      {
        sessionUpdate: 'tool_call',
        toolCallId: 'tc1',
        title: 'read_file',
        status: 'pending',
        rawInput: { file_path: '/a.txt' },
      },
    ]);
    expect(parts.find(p => p.type === 'tool-call')).toMatchObject({
      type: 'tool-call',
      toolCallId: 'tc1',
      toolName: 'read',
      nativeName: 'read_file',
      input: JSON.stringify({ file_path: '/a.txt' }),
    });
  });

  it('emits grok-internal tools (search_tool/use_tool) as raw, not tool-call', () => {
    const s = createAcpStreamState();
    const searchParts = mapAcpUpdate(
      {
        sessionUpdate: 'tool_call',
        toolCallId: 'g1',
        title: 'search_tool',
        status: 'pending',
        rawInput: { query: 'weather' },
      },
      s,
    );
    expect(searchParts.find(p => p.type === 'tool-call')).toBeUndefined();
    expect(searchParts.find(p => p.type === 'raw')).toBeDefined();

    const updateParts = mapAcpUpdate(
      {
        sessionUpdate: 'tool_call_update',
        toolCallId: 'g1',
        status: 'completed',
        rawOutput: 'found',
      },
      s,
    );
    expect(updateParts.find(p => p.type === 'tool-result')).toBeUndefined();
    expect(updateParts.find(p => p.type === 'raw')).toBeDefined();
  });

  it('emits a file-change for a tool_call carrying a diff content entry', () => {
    const parts = run([
      {
        sessionUpdate: 'tool_call',
        toolCallId: 'tc2',
        title: 'search_replace',
        kind: 'edit',
        status: 'pending',
        rawInput: { file_path: '/b.txt' },
        content: [{ type: 'diff', diff: { path: '/b.txt' } }],
      },
    ]);
    expect(parts.find(p => p.type === 'tool-call')).toBeDefined();
    expect(parts.find(p => p.type === 'file-change')).toMatchObject({
      type: 'file-change',
      event: 'modify',
      path: '/b.txt',
    });
  });

  it('suppresses tool_call and its update for a host tool (relay owns it)', () => {
    const s = createAcpStreamState(new Set(['get_weather']));
    const callParts = mapAcpUpdate(
      {
        sessionUpdate: 'tool_call',
        toolCallId: 'h1',
        title: 'get_weather',
        status: 'pending',
        rawInput: { city: 'sf' },
      },
      s,
    );
    expect(callParts.find(p => p.type === 'tool-call')).toBeUndefined();
    const updateParts = mapAcpUpdate(
      {
        sessionUpdate: 'tool_call_update',
        toolCallId: 'h1',
        status: 'completed',
        rawOutput: 'sunny',
      },
      s,
    );
    expect(updateParts.find(p => p.type === 'tool-result')).toBeUndefined();
  });

  it('suppresses host tools when grok prefixes the server name onto the title', () => {
    const s = createAcpStreamState(new Set(['get_weather']));
    const callParts = mapAcpUpdate(
      {
        sessionUpdate: 'tool_call',
        toolCallId: 'h2',
        title: 'harness-tools__get_weather',
        status: 'pending',
        rawInput: {},
      },
      s,
    );
    expect(callParts.find(p => p.type === 'tool-call')).toBeUndefined();
  });

  it('maps a completed tool_call_update to a tool-result', () => {
    const parts = run([
      {
        sessionUpdate: 'tool_call_update',
        toolCallId: 'tc1',
        status: 'completed',
        rawOutput: 'done',
      },
    ]);
    expect(parts.find(p => p.type === 'tool-result')).toMatchObject({
      type: 'tool-result',
      toolCallId: 'tc1',
      result: 'done',
      isError: false,
    });
  });

  it('returns no parts for in_progress tool_call_update', () => {
    const s = createAcpStreamState();
    s.streamStarted = true;
    const parts = mapAcpUpdate(
      {
        sessionUpdate: 'tool_call_update',
        toolCallId: 'tc1',
        status: 'in_progress',
      },
      s,
    );
    expect(parts).toEqual([]);
  });

  it('maps a failed tool_call_update to an error tool-result', () => {
    const parts = run([
      {
        sessionUpdate: 'tool_call_update',
        toolCallId: 'tc1',
        status: 'failed',
        content: 'boom',
      },
    ]);
    expect(parts.find(p => p.type === 'tool-result')).toMatchObject({
      isError: true,
      result: 'boom',
    });
  });

  it('maps unknown sessionUpdate to raw', () => {
    const parts = run([{ sessionUpdate: 'something_new', foo: 1 }]);
    expect(parts).toEqual([
      { type: 'stream-start' },
      { type: 'raw', rawValue: { sessionUpdate: 'something_new', foo: 1 } },
    ]);
  });

  it('returns [] for malformed input', () => {
    expect(mapAcpUpdate(null, createAcpStreamState())).toEqual([]);
    expect(mapAcpUpdate('nope', createAcpStreamState())).toEqual([]);
    expect(
      mapAcpUpdate({ noSessionUpdate: true }, createAcpStreamState()),
    ).toEqual([]);
  });
});

describe('finishFromResult', () => {
  it('maps end_turn to stop and populates usage from _meta', () => {
    const parts = finishFromResult({
      stopReason: 'end_turn',
      _meta: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    });
    const finish = parts.find(p => p.type === 'finish');
    expect(finish).toMatchObject({
      type: 'finish',
      finishReason: { unified: 'stop', raw: 'end_turn' },
    });
    expect(
      finish && finish.type === 'finish' && finish.totalUsage,
    ).toMatchObject({
      inputTokens: { total: 10 },
      outputTokens: { total: 5 },
    });
  });

  it('maps max_tokens to length with undefined usage when _meta absent', () => {
    const parts = finishFromResult({ stopReason: 'max_tokens' });
    const finish = parts.find(p => p.type === 'finish');
    expect(finish).toMatchObject({
      finishReason: { unified: 'length', raw: 'max_tokens' },
    });
    expect(finish && finish.type === 'finish' && finish.totalUsage).toEqual({
      inputTokens: {
        total: undefined,
        noCache: undefined,
        cacheRead: undefined,
        cacheWrite: undefined,
      },
      outputTokens: { total: undefined, text: undefined, reasoning: undefined },
    });
  });
});
