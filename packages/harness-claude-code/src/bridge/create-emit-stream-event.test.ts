import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  type ClaudeMessage,
  createClaudeStreamEventState,
  createEmitStreamEvent,
} from './create-emit-stream-event';

/** The tool-input parts only; every stream opens with an unrelated `stream-start`. */
const toolInput = (emitted: Record<string, unknown>[]) =>
  emitted.filter(event => String(event.type).startsWith('tool-input'));

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

  it('keeps subagent messages out of the main Agent-tool step', () => {
    const messages = JSON.parse(
      readFileSync(
        new URL('./__fixtures__/subagent-step-stream.json', import.meta.url),
        'utf8',
      ),
    ) as ClaudeMessage[];
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

    for (const message of messages) {
      emitStreamEvent(message);
    }
    emitStreamEvent({
      type: 'stream_event',
      parent_tool_use_id: 'toolu_main_agent',
      event: {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text' },
      },
    });
    emitStreamEvent({
      type: 'stream_event',
      parent_tool_use_id: 'toolu_main_agent',
      event: {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'subagent text' },
      },
    });
    emitStreamEvent({
      type: 'stream_event',
      parent_tool_use_id: 'toolu_main_agent',
      event: { type: 'content_block_stop', index: 0 },
    });

    const finishStep = emitted.find(event => event.type === 'finish-step');
    const leakedSubagentEvents = emitted.filter(
      event =>
        (event.type === 'text-start' ||
          event.type === 'text-delta' ||
          event.type === 'text-end' ||
          event.type === 'tool-call' ||
          event.type === 'tool-result') &&
        (event.delta === 'subagent text' ||
          (typeof event.toolCallId === 'string' &&
            event.toolCallId.startsWith('toolu_subagent_'))),
    );

    expect(finishStep?.usage).toEqual({
      inputTokens: {
        total: 7905,
        noCache: 2,
        cacheRead: 2298,
        cacheWrite: 5605,
      },
      outputTokens: {
        total: 5,
        text: 5,
      },
    });
    expect(leakedSubagentEvents).toEqual([]);
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

  it('does not expose the internal structured output tool', () => {
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
        content: [
          {
            type: 'tool_use',
            id: 'structured-output',
            name: 'StructuredOutput',
            input: { answer: 'yes' },
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
            tool_use_id: 'structured-output',
            content: '{"answer":"yes"}',
          },
        ],
      },
    });

    expect(
      emitted.filter(
        event =>
          event.type === 'tool-call' ||
          event.type === 'tool-result' ||
          event.type === 'finish-step',
      ),
    ).toEqual([]);
  });

  it('marks external MCP tools as dynamic and suppresses typed host tools', () => {
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
        content: [
          {
            type: 'tool_use',
            id: 'external-tool',
            name: 'mcp__context7__query-docs',
            input: { libraryId: '/vercel/next.js' },
          },
          {
            type: 'tool_use',
            id: 'host-tool',
            name: 'mcp__harness-tools__weather',
            input: {},
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
            tool_use_id: 'external-tool',
            content: 'docs',
          },
          {
            type: 'tool_result',
            tool_use_id: 'host-tool',
            content: 'sunny',
          },
        ],
      },
    });

    expect(
      emitted.filter(
        event => event.type === 'tool-call' || event.type === 'tool-result',
      ),
    ).toMatchInlineSnapshot(`
      [
        {
          "dynamic": true,
          "input": "{\"libraryId\":\"/vercel/next.js\"}",
          "nativeName": "mcp__context7__query-docs",
          "providerExecuted": true,
          "toolCallId": "external-tool",
          "toolName": "mcp__context7__query-docs",
          "type": "tool-call",
        },
        {
          "dynamic": true,
          "isError": false,
          "result": "docs",
          "toolCallId": "external-tool",
          "toolName": "mcp__context7__query-docs",
          "type": "tool-result",
        },
      ]
    `);
  });

  it('parses external MCP JSON results without parsing native tool results', () => {
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
        content: [
          {
            type: 'tool_use',
            id: 'mcp-object',
            name: 'mcp__context7__query-docs',
            input: {},
          },
          {
            type: 'tool_use',
            id: 'mcp-array',
            name: 'mcp__context7__query-docs',
            input: {},
          },
          {
            type: 'tool_use',
            id: 'mcp-text',
            name: 'mcp__context7__query-docs',
            input: {},
          },
          {
            type: 'tool_use',
            id: 'native-tool',
            name: 'Read',
            input: {},
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
            tool_use_id: 'mcp-object',
            content: '{"library":"next.js","version":16}',
          },
          {
            type: 'tool_result',
            tool_use_id: 'mcp-array',
            content: '["docs","examples"]',
          },
          {
            type: 'tool_result',
            tool_use_id: 'mcp-text',
            content: 'not JSON',
          },
          {
            type: 'tool_result',
            tool_use_id: 'native-tool',
            content: '{"path":"README.md"}',
          },
        ],
      },
    });

    expect(emitted.filter(event => event.type === 'tool-result'))
      .toMatchInlineSnapshot(`
      [
        {
          "dynamic": true,
          "isError": false,
          "result": {
            "library": "next.js",
            "version": 16,
          },
          "toolCallId": "mcp-object",
          "toolName": "mcp__context7__query-docs",
          "type": "tool-result",
        },
        {
          "dynamic": true,
          "isError": false,
          "result": [
            "docs",
            "examples",
          ],
          "toolCallId": "mcp-array",
          "toolName": "mcp__context7__query-docs",
          "type": "tool-result",
        },
        {
          "dynamic": true,
          "isError": false,
          "result": "not JSON",
          "toolCallId": "mcp-text",
          "toolName": "mcp__context7__query-docs",
          "type": "tool-result",
        },
        {
          "isError": false,
          "result": "{\"path\":\"README.md\"}",
          "toolCallId": "native-tool",
          "toolName": "Read",
          "type": "tool-result",
        },
      ]
    `);
  });

  it("streams a tool call's input as it is generated", () => {
    /*
     * Claude emits a tool call's arguments incrementally, as `input_json_delta`
     * on a `tool_use` content block. Without this the input only becomes
     * visible when the assistant message lands, so a tool call that takes
     * minutes to generate puts nothing on the wire until it is finished.
     */
    const state = createClaudeStreamEventState();
    const emitted: Record<string, unknown>[] = [];
    const emitStreamEvent = createEmitStreamEvent({
      state,
      emit: event => emitted.push(event),
      emitWarning: () => {},
      emitTerminalError: () => {},
      onCompactionBoundary: () => {},
      toCommonName: name => (name === 'Write' ? 'write' : name),
    });

    emitStreamEvent({
      type: 'stream_event',
      event: {
        type: 'content_block_start',
        index: 1,
        content_block: { type: 'tool_use', id: 'toolu_1', name: 'Write' },
      },
    });
    for (const partial_json of ['{"file_path":', '"a.html"}']) {
      emitStreamEvent({
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          index: 1,
          delta: { type: 'input_json_delta', partial_json },
        },
      });
    }
    emitStreamEvent({
      type: 'stream_event',
      event: { type: 'content_block_stop', index: 1 },
    });

    expect(toolInput(emitted)).toEqual([
      {
        type: 'tool-input-start',
        id: 'toolu_1',
        toolName: 'write',
        nativeName: 'Write',
        providerExecuted: true,
      },
      { type: 'tool-input-delta', id: 'toolu_1', delta: '{"file_path":' },
      { type: 'tool-input-delta', id: 'toolu_1', delta: '"a.html"}' },
      { type: 'tool-input-end', id: 'toolu_1' },
    ]);
  });

  it('ends the tool input before the tool call, not after it', () => {
    /*
     * The assistant message carrying the finished `tool_use` block arrives
     * BEFORE that block's `content_block_stop`, so closing only on
     * `content_block_stop` would emit `tool-input-end` after its own
     * `tool-call`.
     */
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
        content_block: { type: 'tool_use', id: 'toolu_9', name: 'Glob' },
      },
    });
    emitStreamEvent({
      type: 'assistant',
      message: {
        content: [
          { type: 'tool_use', id: 'toolu_9', name: 'Glob', input: { a: 1 } },
        ],
      },
    });
    emitStreamEvent({
      type: 'stream_event',
      event: { type: 'content_block_stop', index: 0 },
    });

    expect(
      emitted
        .map(event => event.type)
        .filter(type => String(type).startsWith('tool-')),
    ).toEqual(['tool-input-start', 'tool-input-end', 'tool-call']);
    // And the ids line up, so a consumer can pair them.
    expect(emitted.find(e => e.type === 'tool-input-end')?.id).toBe('toolu_9');
    expect(emitted.find(e => e.type === 'tool-call')?.toolCallId).toBe(
      'toolu_9',
    );
  });

  it('marks an external MCP tool dynamic, and streams no input for internal ones', () => {
    /*
     * `StructuredOutput` never surfaces, and a host tool's call is emitted by
     * the MCP path rather than the assistant message. Streaming input for
     * either would produce a `tool-input-start` with no matching `tool-call`.
     */
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

    for (const [index, name] of [
      [0, 'StructuredOutput'],
      [1, 'mcp__harness-tools__ask_user'],
      [2, 'mcp__deepwiki__ask_question'],
    ] as const) {
      emitStreamEvent({
        type: 'stream_event',
        event: {
          type: 'content_block_start',
          index,
          content_block: { type: 'tool_use', id: `toolu_${index}`, name },
        },
      });
    }

    expect(toolInput(emitted)).toEqual([
      {
        type: 'tool-input-start',
        id: 'toolu_2',
        toolName: 'mcp__deepwiki__ask_question',
        nativeName: 'mcp__deepwiki__ask_question',
        providerExecuted: true,
        dynamic: true,
      },
    ]);
  });

  it("ignores a subagent's tool input, like every other partial event", () => {
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
      parent_tool_use_id: 'parent-1',
      event: {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'tool_use', id: 'toolu_sub', name: 'Write' },
      },
    } as ClaudeMessage);

    expect(toolInput(emitted)).toEqual([]);
  });
});
