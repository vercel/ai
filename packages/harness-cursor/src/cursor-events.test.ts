import { describe, expect, it, vi } from 'vitest';
import {
  createCursorTranslatorState,
  finalizeCursorTextBlocks,
  toCursorCommonName,
  translateCursorStreamEvent,
} from './cursor-events';

describe('toCursorCommonName', () => {
  it('maps shell to bash', () => {
    expect(toCursorCommonName('shell')).toBe('bash');
  });

  it('passes through unknown names', () => {
    expect(toCursorCommonName('customTool')).toBe('customTool');
  });
});

describe('translateCursorStreamEvent', () => {
  it('emits stream-start from system init', () => {
    const emitted: Array<Record<string, unknown>> = [];
    const state = createCursorTranslatorState();
    translateCursorStreamEvent(
      { type: 'system', model: { id: 'composer-2.5' } },
      state,
      msg => emitted.push(msg),
    );
    expect(emitted).toEqual([
      { type: 'stream-start', modelId: 'composer-2.5' },
    ]);
  });

  it('emits text deltas from assistant messages', () => {
    const emitted: Array<Record<string, unknown>> = [];
    const state = createCursorTranslatorState();
    translateCursorStreamEvent(
      {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello' }],
        },
      },
      state,
      msg => emitted.push(msg),
    );
    expect(emitted[0]).toMatchObject({ type: 'text-start' });
    expect(emitted[1]).toMatchObject({
      type: 'text-delta',
      delta: 'Hello',
    });
  });

  it('emits tool-call and tool-result for builtins', () => {
    const emitted: Array<Record<string, unknown>> = [];
    const state = createCursorTranslatorState();
    translateCursorStreamEvent(
      {
        type: 'tool_call',
        call_id: 'c1',
        name: 'shell',
        status: 'running',
        args: { command: 'ls' },
      },
      state,
      msg => emitted.push(msg),
    );
    translateCursorStreamEvent(
      {
        type: 'tool_call',
        call_id: 'c1',
        name: 'shell',
        status: 'completed',
        result: 'ok',
      },
      state,
      msg => emitted.push(msg),
    );
    expect(emitted[0]).toMatchObject({
      type: 'tool-call',
      toolName: 'bash',
      providerExecuted: true,
    });
    expect(emitted[1]).toMatchObject({
      type: 'tool-result',
      toolCallId: 'c1',
    });
  });

  it('denies inactive built-in tools at stream time', () => {
    const emitted: Array<Record<string, unknown>> = [];
    const state = createCursorTranslatorState([], {
      mode: 'deny',
      toolNames: ['bash'],
    });
    translateCursorStreamEvent(
      {
        type: 'tool_call',
        call_id: 'c-deny',
        name: 'shell',
        status: 'running',
        args: { command: 'ls' },
      },
      state,
      msg => emitted.push(msg),
    );
    translateCursorStreamEvent(
      {
        type: 'tool_call',
        call_id: 'c-deny',
        name: 'shell',
        status: 'completed',
        result: 'should be ignored',
      },
      state,
      msg => emitted.push(msg),
    );
    expect(emitted).toEqual([
      {
        type: 'tool-call',
        toolCallId: 'c-deny',
        toolName: 'bash',
        nativeName: 'shell',
        input: '{"command":"ls"}',
        providerExecuted: true,
      },
      {
        type: 'tool-result',
        toolCallId: 'c-deny',
        toolName: 'bash',
        result:
          "Tool 'bash' is inactive due to the HarnessAgent tool filtering policy.",
        isError: true,
      },
    ]);
  });

  it('marks host tools as not provider-executed', () => {
    const emitted: Array<Record<string, unknown>> = [];
    const state = createCursorTranslatorState(['deploy']);
    translateCursorStreamEvent(
      {
        type: 'tool_call',
        call_id: 'c2',
        name: 'deploy',
        status: 'running',
        args: {},
      },
      state,
      msg => emitted.push(msg),
    );
    expect(emitted[0]).toMatchObject({
      type: 'tool-call',
      providerExecuted: false,
    });
  });

  it('finalizes open text blocks', () => {
    const emitted: Array<Record<string, unknown>> = [];
    const state = createCursorTranslatorState();
    translateCursorStreamEvent(
      {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Hi' }],
        },
      },
      state,
      msg => emitted.push(msg),
    );
    finalizeCursorTextBlocks(state, msg => emitted.push(msg));
    expect(emitted.at(-1)).toMatchObject({ type: 'text-end' });
  });
});
