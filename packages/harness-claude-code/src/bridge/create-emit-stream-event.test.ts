import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  type ClaudeMessage,
  createClaudeStreamEventState,
  createEmitStreamEvent,
} from './create-emit-stream-event';

describe('createEmitStreamEvent', () => {
  const mcpImageBlock = {
    type: 'image',
    source: { type: 'base64', media_type: 'image/png', data: 'iVBORw0KGgo' },
  };

  it.each([
    {
      name: 'TaskCreate object output',
      nativeName: 'TaskCreate',
      content: 'Task #1 created successfully: probe-task',
      toolUseResult: { task: { id: '1', subject: 'probe-task' } },
      isError: false,
      expectedResult: { task: { id: '1', subject: 'probe-task' } },
    },
    {
      name: 'Read object output',
      nativeName: 'Read',
      content: '1\talpha\n2\tbeta\n3\tgamma\n4\t',
      toolUseResult: {
        type: 'text',
        file: {
          filePath: '/tmp/sample.txt',
          content: 'alpha\nbeta\ngamma\n',
          numLines: 4,
          startLine: 1,
          totalLines: 4,
        },
      },
      isError: false,
      expectedResult: {
        type: 'text',
        file: {
          filePath: '/tmp/sample.txt',
          content: 'alpha\nbeta\ngamma\n',
          numLines: 4,
          startLine: 1,
          totalLines: 4,
        },
      },
    },
    {
      name: 'successful Bash object output',
      nativeName: 'Bash',
      content: 'hello-stdouthello-stderr',
      toolUseResult: {
        stdout: 'hello-stdouthello-stderr',
        stderr: '',
        interrupted: false,
        isImage: false,
        noOutputExpected: false,
      },
      isError: false,
      expectedResult: {
        stdout: 'hello-stdouthello-stderr',
        stderr: '',
        interrupted: false,
        isImage: false,
        noOutputExpected: false,
      },
    },
    {
      name: 'failed Bash string output',
      nativeName: 'Bash',
      content: 'Exit code 2\nmissing',
      toolUseResult: 'Error: Exit code 2\nmissing',
      isError: true,
      expectedResult: 'Error: Exit code 2\nmissing',
    },
  ])(
    'uses the Claude Agent SDK output for $name',
    ({ nativeName, content, toolUseResult, isError, expectedResult }) => {
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

      emitStreamEvent({
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'tool-1',
              name: nativeName,
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
              tool_use_id: 'tool-1',
              content,
              is_error: isError,
            },
          ],
        },
        tool_use_result: toolUseResult,
      });

      expect(emitted.find(event => event.type === 'tool-result')).toEqual({
        type: 'tool-result',
        toolCallId: 'tool-1',
        toolName: nativeName === 'Bash' ? 'bash' : nativeName,
        result: expectedResult,
        isError,
      });
    },
  );

  it('falls back to model-facing content when the SDK does not provide an output', () => {
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
            id: 'tool-1',
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
            tool_use_id: 'tool-1',
            content: 'file contents',
          },
        ],
      },
    });

    expect(emitted.find(event => event.type === 'tool-result')).toEqual({
      type: 'tool-result',
      toolCallId: 'tool-1',
      toolName: 'Read',
      result: 'file contents',
      isError: false,
    });
  });

  it('falls back to model-facing content when a singular output cannot be paired with multiple results', () => {
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
            id: 'tool-1',
            name: 'Read',
            input: {},
          },
          {
            type: 'tool_use',
            id: 'tool-2',
            name: 'Glob',
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
            tool_use_id: 'tool-1',
            content: 'file contents',
          },
          {
            type: 'tool_result',
            tool_use_id: 'tool-2',
            content: 'sample.txt',
          },
        ],
      },
      tool_use_result: { filenames: ['sample.txt'] },
    });

    expect(
      emitted
        .filter(event => event.type === 'tool-result')
        .map(event => event.result),
    ).toEqual(['file contents', 'sample.txt']);
  });

  it('streams native tool input before the complete tool call', () => {
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
        content_block: {
          type: 'tool_use',
          id: 'tool-1',
          name: 'Write',
        },
      },
    });
    emitStreamEvent({
      type: 'stream_event',
      event: {
        type: 'content_block_delta',
        index: 1,
        delta: {
          type: 'input_json_delta',
          partial_json: '{"file_path":"notes.md",',
        },
      },
    });
    emitStreamEvent({
      type: 'stream_event',
      event: {
        type: 'content_block_delta',
        index: 1,
        delta: {
          type: 'input_json_delta',
          partial_json: '"content":"hello"}',
        },
      },
    });
    emitStreamEvent({
      type: 'stream_event',
      event: { type: 'content_block_stop', index: 1 },
    });

    expect(emitted).toEqual([
      { type: 'stream-start' },
      {
        type: 'tool-input-start',
        id: 'tool-1',
        toolName: 'write',
        providerExecuted: true,
      },
      {
        type: 'tool-input-delta',
        id: 'tool-1',
        delta: '{"file_path":"notes.md",',
      },
      {
        type: 'tool-input-delta',
        id: 'tool-1',
        delta: '"content":"hello"}',
      },
      { type: 'tool-input-end', id: 'tool-1' },
    ]);
    expect(state.partialBlocks.size).toBe(0);
  });

  it('streams host tool input with its user-facing identity', () => {
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
        index: 1,
        content_block: {
          type: 'tool_use',
          id: 'host-tool-1',
          name: 'mcp__harness-tools__weather',
        },
      },
    });
    emitStreamEvent({
      type: 'stream_event',
      event: {
        type: 'content_block_delta',
        index: 1,
        delta: {
          type: 'input_json_delta',
          partial_json: '{"city":"Chicago"}',
        },
      },
    });
    emitStreamEvent({
      type: 'stream_event',
      event: { type: 'content_block_stop', index: 1 },
    });

    expect(emitted).toEqual([
      { type: 'stream-start' },
      {
        type: 'tool-input-start',
        id: 'host-tool-1',
        toolName: 'weather',
        providerExecuted: false,
      },
      {
        type: 'tool-input-delta',
        id: 'host-tool-1',
        delta: '{"city":"Chicago"}',
      },
      { type: 'tool-input-end', id: 'host-tool-1' },
    ]);
  });

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

  it('suppresses native question tool calls', () => {
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
            id: 'question-tool',
            name: 'AskUserQuestion',
            input: {
              questions: [{ question: 'Which framework?' }],
            },
          },
        ],
      },
    });

    expect(emitted).toEqual([{ type: 'stream-start' }]);
  });

  it('parses external MCP JSON objects while leaving scalars and native tool results as strings', () => {
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
            id: 'mcp-number',
            name: 'mcp__context7__query-docs',
            input: {},
          },
          {
            type: 'tool_use',
            id: 'mcp-boolean',
            name: 'mcp__context7__query-docs',
            input: {},
          },
          {
            type: 'tool_use',
            id: 'mcp-null',
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
            "dynamic": true,
            "isError": false,
            "result": "42",
            "toolCallId": "mcp-number",
            "toolName": "mcp__context7__query-docs",
            "type": "tool-result",
          },
          {
            "dynamic": true,
            "isError": false,
            "result": "true",
            "toolCallId": "mcp-boolean",
            "toolName": "mcp__context7__query-docs",
            "type": "tool-result",
          },
          {
            "dynamic": true,
            "isError": false,
            "result": "null",
            "toolCallId": "mcp-null",
            "toolName": "mcp__context7__query-docs",
            "type": "tool-result",
          },
          {
            "isError": false,
            "result": "{"path":"README.md"}",
            "toolCallId": "native-tool",
            "toolName": "Read",
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
      mcpImageBlock,
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

    expect(
      emitted
        .filter(event => event.type === 'tool-result')
        .map(event => event.result),
    ).toEqual([imageContent, imageContent]);
  });

  it('resolves content when a structured output cannot be paired with parallel MCP results', () => {
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

    const imageContent = [mcpImageBlock];

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
            id: 'mcp-scalar',
            name: 'mcp__charts__count',
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
            tool_use_id: 'mcp-scalar',
            content: '42',
          },
        ],
      },
      tool_use_result: { unpairable: true },
    });

    expect(
      emitted
        .filter(event => event.type === 'tool-result')
        .map(event => event.result),
    ).toEqual([imageContent, '42']);
  });
});
