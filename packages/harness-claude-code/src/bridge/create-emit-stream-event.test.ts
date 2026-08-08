import { describe, expect, it } from 'vitest';
import {
  createClaudeStreamEventState,
  createEmitStreamEvent,
  emitOpenFinishSteps,
} from './create-emit-stream-event';

describe('createEmitStreamEvent', () => {
  it('emits the resolved model and a native tool step', () => {
    const state = createClaudeStreamEventState();
    const emitted: Record<string, unknown>[] = [];
    const emitStreamEvent = createEmitStreamEvent({
      state,
      emit: event => emitted.push(event),
      emitWarning: () => {},
      emitTerminalError: () => {},
      onCompactionBoundary: () => {},
      toCommonName: name => (name === 'Bash' ? 'bash' : name),
    });

    emitStreamEvent({ type: 'system', subtype: 'init', model: 'claude-opus' });
    emitStreamEvent({
      type: 'assistant',
      message: {
        usage: { input_tokens: 3, output_tokens: 2 },
        content: [
          {
            type: 'tool_use',
            id: 'tool-1',
            name: 'Bash',
            input: { command: 'pwd' },
          },
        ],
      },
    });
    emitStreamEvent({
      type: 'user',
      message: {
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'tool-1',
            content: '/tmp',
          },
        ],
      },
    });

    expect(emitted).toMatchInlineSnapshot(`
      [
        {
          "modelId": "claude-opus",
          "type": "stream-start",
        },
        {
          "input": "{\"command\":\"pwd\"}",
          "nativeName": "Bash",
          "providerExecuted": true,
          "toolCallId": "tool-1",
          "toolName": "bash",
          "type": "tool-call",
        },
        {
          "isError": false,
          "result": {
            "exitCode": 0,
            "stdout": "/tmp",
          },
          "toolCallId": "tool-1",
          "toolName": "bash",
          "type": "tool-result",
        },
        {
          "finishReason": {
            "raw": "stop",
            "unified": "stop",
          },
          "type": "finish-step",
          "usage": {
            "inputTokens": {
              "cacheRead": 0,
              "cacheWrite": 0,
              "noCache": 3,
              "total": 3,
            },
            "outputTokens": {
              "text": 2,
              "total": 2,
            },
          },
        },
      ]
    `);
  });

  it('preserves retry and compaction handling', () => {
    const state = createClaudeStreamEventState();
    const warnings: unknown[] = [];
    const terminalErrors: unknown[] = [];
    const boundaries: unknown[] = [];
    const emitStreamEvent = createEmitStreamEvent({
      state,
      emit: () => {},
      emitWarning: warning => warnings.push(warning),
      emitTerminalError: error => terminalErrors.push(error),
      onCompactionBoundary: boundary => boundaries.push(boundary),
      toCommonName: name => name,
    });

    emitStreamEvent({
      type: 'system',
      subtype: 'api_retry',
      attempt: 2,
      max_retries: 4,
      error_status: 500,
      retry_delay_ms: 100,
      error: 'temporary',
    });
    emitStreamEvent({
      type: 'system',
      subtype: 'compact_boundary',
      compact_metadata: {
        trigger: 'auto',
        pre_tokens: 20,
        post_tokens: 5,
      },
    });
    emitStreamEvent({
      type: 'system',
      subtype: 'api_retry',
      error_status: 401,
      error: 'unauthorized',
    });

    expect({ warnings, terminalErrors, boundaries }).toMatchInlineSnapshot(`
      {
        "boundaries": [
          {
            "tokensAfter": 5,
            "tokensBefore": 20,
            "trigger": "auto",
          },
        ],
        "terminalErrors": [
          "HTTP 401: unauthorized",
        ],
        "warnings": [
          {
            "message": "Claude Code API retry: attempt 2/4; HTTP 500; retrying in 100ms; temporary",
          },
        ],
      }
    `);
  });

  it('keeps interleaved sibling partial blocks and steps in separate lanes', () => {
    const state = createClaudeStreamEventState();
    const emitted: Record<string, unknown>[] = [];
    const emitStreamEvent = createEmitStreamEvent({
      state,
      emit: event => emitted.push(event),
      emitWarning: () => {},
      emitTerminalError: () => {},
      onCompactionBoundary: () => {},
      toCommonName: name => name,
    });

    emitStreamEvent({
      type: 'stream_event',
      parent_tool_use_id: 'agent-alpha',
      event: {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text' },
      },
    });
    emitStreamEvent({
      type: 'stream_event',
      parent_tool_use_id: 'agent-beta',
      event: {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text' },
      },
    });
    emitStreamEvent({
      type: 'stream_event',
      parent_tool_use_id: 'agent-alpha',
      event: {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'alpha' },
      },
    });
    emitStreamEvent({
      type: 'stream_event',
      parent_tool_use_id: 'agent-beta',
      event: {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'beta' },
      },
    });
    emitStreamEvent({
      type: 'stream_event',
      parent_tool_use_id: 'agent-alpha',
      event: { type: 'content_block_stop', index: 0 },
    });
    emitStreamEvent({
      type: 'stream_event',
      parent_tool_use_id: 'agent-beta',
      event: { type: 'content_block_stop', index: 0 },
    });

    expect(emitted[0]).toEqual({ type: 'stream-start' });
    expect(emitted[1]).toMatchObject({
      type: 'text-start',
      harnessMetadata: {
        'claude-code': { parentToolUseId: 'agent-alpha' },
      },
    });
    expect(emitted[2]).toMatchObject({
      type: 'text-start',
      harnessMetadata: {
        'claude-code': { parentToolUseId: 'agent-beta' },
      },
    });
    expect(emitted[3]).toMatchObject({
      type: 'text-delta',
      id: emitted[1].id,
      delta: 'alpha',
      harnessMetadata: {
        'claude-code': { parentToolUseId: 'agent-alpha' },
      },
    });
    expect(emitted[4]).toMatchObject({
      type: 'text-delta',
      id: emitted[2].id,
      delta: 'beta',
      harnessMetadata: {
        'claude-code': { parentToolUseId: 'agent-beta' },
      },
    });
    expect(emitted[5]).toMatchObject({
      type: 'text-end',
      id: emitted[1].id,
    });
    expect(emitted[6]).toMatchObject({
      type: 'text-end',
      id: emitted[2].id,
    });

    emitStreamEvent({
      type: 'assistant',
      parent_tool_use_id: 'agent-alpha',
      message: {
        usage: { input_tokens: 1, output_tokens: 2 },
        content: [
          {
            type: 'tool_use',
            id: 'write-alpha',
            name: 'Write',
            input: { file_path: '/tmp/alpha' },
          },
        ],
      },
    });
    emitStreamEvent({
      type: 'assistant',
      parent_tool_use_id: 'agent-beta',
      message: {
        usage: { input_tokens: 3, output_tokens: 4 },
        content: [
          {
            type: 'tool_use',
            id: 'write-beta',
            name: 'Write',
            input: { file_path: '/tmp/beta' },
          },
        ],
      },
    });
    emitStreamEvent({
      type: 'user',
      parent_tool_use_id: 'agent-alpha',
      message: {
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'write-alpha',
            content: 'alpha done',
          },
        ],
      },
    });

    expect(emitted.at(-2)).toMatchObject({
      type: 'tool-result',
      toolCallId: 'write-alpha',
      providerMetadata: {
        'claude-code': { parentToolUseId: 'agent-alpha' },
      },
    });
    expect(emitted.at(-1)).toMatchObject({
      type: 'finish-step',
      harnessMetadata: {
        'claude-code': { parentToolUseId: 'agent-alpha' },
      },
    });
    expect(state.lanes.get('agent-beta')?.stepOpen).toBe(true);
    expect(state.lanes.get('agent-beta')?.pendingStepToolUseIds).toEqual(
      new Set(['write-beta']),
    );
  });

  it('attributes reasoning events while leaving root text metadata unset', () => {
    const state = createClaudeStreamEventState();
    const emitted: Record<string, unknown>[] = [];
    const emitStreamEvent = createEmitStreamEvent({
      state,
      emit: event => emitted.push(event),
      emitWarning: () => {},
      emitTerminalError: () => {},
      onCompactionBoundary: () => {},
      toCommonName: name => name,
    });

    emitStreamEvent({
      type: 'stream_event',
      event: {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text' },
      },
    });
    emitStreamEvent({
      type: 'stream_event',
      event: {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'root' },
      },
    });
    emitStreamEvent({
      type: 'stream_event',
      event: { type: 'content_block_stop', index: 0 },
    });
    emitStreamEvent({
      type: 'stream_event',
      parent_tool_use_id: 'agent-gamma',
      event: {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'thinking' },
      },
    });
    emitStreamEvent({
      type: 'stream_event',
      parent_tool_use_id: 'agent-gamma',
      event: {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'thinking_delta', thinking: 'considering' },
      },
    });
    emitStreamEvent({
      type: 'stream_event',
      parent_tool_use_id: 'agent-gamma',
      event: { type: 'content_block_stop', index: 0 },
    });

    for (const event of emitted.slice(0, 4)) {
      expect(event).not.toHaveProperty('harnessMetadata');
    }
    expect(emitted.slice(4)).toEqual([
      expect.objectContaining({
        type: 'reasoning-start',
        harnessMetadata: {
          'claude-code': { parentToolUseId: 'agent-gamma' },
        },
      }),
      expect.objectContaining({
        type: 'reasoning-delta',
        delta: 'considering',
        harnessMetadata: {
          'claude-code': { parentToolUseId: 'agent-gamma' },
        },
      }),
      expect.objectContaining({
        type: 'reasoning-end',
        harnessMetadata: {
          'claude-code': { parentToolUseId: 'agent-gamma' },
        },
      }),
    ]);
  });

  it('preserves the immediate parent for nested grandchildren', () => {
    const state = createClaudeStreamEventState();
    const emitted: Record<string, unknown>[] = [];
    const emitStreamEvent = createEmitStreamEvent({
      state,
      emit: event => emitted.push(event),
      emitWarning: () => {},
      emitTerminalError: () => {},
      onCompactionBoundary: () => {},
      toCommonName: name => name,
    });

    emitStreamEvent({
      type: 'assistant',
      parent_tool_use_id: 'agent-alpha',
      message: {
        usage: { input_tokens: 2, output_tokens: 3 },
        content: [
          {
            type: 'tool_use',
            id: 'agent-alpha-child',
            name: 'Agent',
            input: { prompt: 'write the grandchild file' },
          },
        ],
      },
    });
    emitStreamEvent({
      type: 'assistant',
      parent_tool_use_id: 'agent-alpha-child',
      message: {
        usage: { input_tokens: 5, output_tokens: 7 },
        content: [
          {
            type: 'tool_use',
            id: 'write-alpha-child',
            name: 'Write',
            input: { file_path: '/tmp/alpha-child' },
          },
        ],
      },
    });
    emitStreamEvent({
      type: 'user',
      parent_tool_use_id: 'agent-alpha-child',
      message: {
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'write-alpha-child',
            content: 'grandchild done',
          },
        ],
      },
    });
    emitStreamEvent({
      type: 'user',
      parent_tool_use_id: 'agent-alpha',
      message: {
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'agent-alpha-child',
            content: 'child done',
          },
        ],
      },
    });

    expect(emitted).toEqual([
      { type: 'stream-start' },
      expect.objectContaining({
        type: 'tool-call',
        toolCallId: 'agent-alpha-child',
        providerMetadata: {
          'claude-code': { parentToolUseId: 'agent-alpha' },
        },
      }),
      expect.objectContaining({
        type: 'tool-call',
        toolCallId: 'write-alpha-child',
        providerMetadata: {
          'claude-code': { parentToolUseId: 'agent-alpha-child' },
        },
      }),
      expect.objectContaining({
        type: 'tool-result',
        toolCallId: 'write-alpha-child',
        providerMetadata: {
          'claude-code': { parentToolUseId: 'agent-alpha-child' },
        },
      }),
      expect.objectContaining({
        type: 'finish-step',
        harnessMetadata: {
          'claude-code': { parentToolUseId: 'agent-alpha-child' },
        },
      }),
      expect.objectContaining({
        type: 'tool-result',
        toolCallId: 'agent-alpha-child',
        providerMetadata: {
          'claude-code': { parentToolUseId: 'agent-alpha' },
        },
      }),
      expect.objectContaining({
        type: 'finish-step',
        harnessMetadata: {
          'claude-code': { parentToolUseId: 'agent-alpha' },
        },
      }),
    ]);
  });

  it('keeps failed tool results in their lane', () => {
    const state = createClaudeStreamEventState();
    const emitted: Record<string, unknown>[] = [];
    const emitStreamEvent = createEmitStreamEvent({
      state,
      emit: event => emitted.push(event),
      emitWarning: () => {},
      emitTerminalError: () => {},
      onCompactionBoundary: () => {},
      toCommonName: name => name,
    });

    emitStreamEvent({
      type: 'assistant',
      parent_tool_use_id: 'agent-gamma',
      message: {
        content: [
          {
            type: 'tool_use',
            id: 'write-gamma',
            name: 'Write',
            input: {},
          },
        ],
      },
    });
    emitStreamEvent({
      type: 'user',
      parent_tool_use_id: 'agent-gamma',
      message: {
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'write-gamma',
            content: 'permission denied',
            is_error: true,
          },
        ],
      },
    });

    expect(emitted.at(-2)).toMatchObject({
      type: 'tool-result',
      toolCallId: 'write-gamma',
      isError: true,
      providerMetadata: {
        'claude-code': { parentToolUseId: 'agent-gamma' },
      },
    });
    expect(emitted.at(-1)).toMatchObject({
      type: 'finish-step',
      harnessMetadata: {
        'claude-code': { parentToolUseId: 'agent-gamma' },
      },
    });
  });

  it('closes every open lane without adding metadata to the root lane', () => {
    const state = createClaudeStreamEventState();
    const emitted: Record<string, unknown>[] = [];
    const emitStreamEvent = createEmitStreamEvent({
      state,
      emit: event => emitted.push(event),
      emitWarning: () => {},
      emitTerminalError: () => {},
      onCompactionBoundary: () => {},
      toCommonName: name => name,
    });

    emitStreamEvent({
      type: 'assistant',
      message: {
        usage: { input_tokens: 1, output_tokens: 1 },
        content: [{ type: 'text', text: 'root' }],
      },
    });
    emitStreamEvent({
      type: 'assistant',
      parent_tool_use_id: 'agent-beta',
      message: {
        usage: { input_tokens: 2, output_tokens: 3 },
        content: [{ type: 'text', text: 'beta' }],
      },
    });
    emitOpenFinishSteps({
      state,
      emit: event => emitted.push(event),
      rootUsage: {
        inputTokens: { total: 10 },
        outputTokens: { total: 5 },
      },
    });

    expect(emitted[1]).toMatchObject({
      type: 'finish-step',
      usage: {
        inputTokens: { total: 10 },
        outputTokens: { total: 5 },
      },
    });
    expect(emitted[1]).not.toHaveProperty('harnessMetadata');
    expect(emitted[2]).toMatchObject({
      type: 'finish-step',
      usage: {
        inputTokens: { total: 2 },
        outputTokens: { total: 3 },
      },
      harnessMetadata: {
        'claude-code': { parentToolUseId: 'agent-beta' },
      },
    });
  });
});
