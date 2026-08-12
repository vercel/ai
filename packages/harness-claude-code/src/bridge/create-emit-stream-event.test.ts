import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  type ClaudeMessage,
  createClaudeStreamEventState,
  createEmitStreamEvent,
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

  it('keeps scalar MCP results as strings', () => {
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
            id: 'mcp-number',
            name: 'mcp__context7__count',
            input: {},
          },
          {
            type: 'tool_use',
            id: 'mcp-boolean',
            name: 'mcp__context7__count',
            input: {},
          },
          {
            type: 'tool_use',
            id: 'mcp-null',
            name: 'mcp__context7__count',
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
            tool_use_id: 'mcp-number',
            content: '42',
          },
          {
            type: 'tool_result',
            tool_use_id: 'mcp-boolean',
            content: 'true',
          },
          {
            type: 'tool_result',
            tool_use_id: 'mcp-null',
            content: 'null',
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
          "result": "42",
          "toolCallId": "mcp-number",
          "toolName": "mcp__context7__count",
          "type": "tool-result",
        },
        {
          "dynamic": true,
          "isError": false,
          "result": "true",
          "toolCallId": "mcp-boolean",
          "toolName": "mcp__context7__count",
          "type": "tool-result",
        },
        {
          "dynamic": true,
          "isError": false,
          "result": "null",
          "toolCallId": "mcp-null",
          "toolName": "mcp__context7__count",
          "type": "tool-result",
        },
      ]
    `);
  });

  it('passes non-text tool result content through unparsed', () => {
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

    const imageContent = [
      { type: 'text', text: 'chart for 2026' },
      {
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/png',
          data: 'iVBORw0KGgo',
        },
      },
    ];

    emitStreamEvent({
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            id: 'mcp-image',
            name: 'mcp__charts__render',
            input: {},
          },
          {
            type: 'tool_use',
            id: 'native-image',
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
            tool_use_id: 'mcp-image',
            content: imageContent,
          },
          {
            type: 'tool_result',
            tool_use_id: 'native-image',
            content: imageContent,
          },
        ],
      },
    });

    // The content array reaches consumers as-is, not flattened to base64 text.
    expect(emitted.filter(event => event.type === 'tool-result'))
      .toMatchInlineSnapshot(`
      [
        {
          "dynamic": true,
          "isError": false,
          "result": [
            {
              "text": "chart for 2026",
              "type": "text",
            },
            {
              "source": {
                "data": "iVBORw0KGgo",
                "media_type": "image/png",
                "type": "base64",
              },
              "type": "image",
            },
          ],
          "toolCallId": "mcp-image",
          "toolName": "mcp__charts__render",
          "type": "tool-result",
        },
        {
          "isError": false,
          "result": [
            {
              "text": "chart for 2026",
              "type": "text",
            },
            {
              "source": {
                "data": "iVBORw0KGgo",
                "media_type": "image/png",
                "type": "base64",
              },
              "type": "image",
            },
          ],
          "toolCallId": "native-image",
          "toolName": "Read",
          "type": "tool-result",
        },
      ]
    `);
  });
});
