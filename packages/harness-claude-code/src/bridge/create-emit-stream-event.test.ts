import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  type ClaudeMessage,
  clearWaitingOnHostInput,
  createClaudeStreamEventState,
  createEmitStreamEvent,
  markWaitingOnHostInput,
} from './create-emit-stream-event';

describe('createEmitStreamEvent', () => {
  const mcpImageBlock = {
    type: 'image',
    source: { type: 'base64', media_type: 'image/png', data: 'iVBORw0KGgo' },
  };

  it('forwards tool progress as a raw stream part', () => {
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
    const progressMessage: ClaudeMessage = {
      type: 'tool_progress',
      parent_tool_use_id: 'tool-1',
    };

    emitStreamEvent(progressMessage);

    expect(emitted).toEqual([
      { type: 'stream-start' },
      { type: 'raw', rawValue: progressMessage },
    ]);
  });

  it.each([
    {
      status: 'rejected',
      resetsAt: 1_791_331_200,
      rateLimitType: 'five_hour',
    },
    { status: 'rejected' },
    { status: 'allowed_warning' },
    { status: 'allowed' },
  ])('forwards rate-limit metadata unchanged: %j', rateLimitInfo => {
    const emitted: Record<string, unknown>[] = [];
    const terminalErrors: Array<string | undefined> = [];
    const message = {
      type: 'rate_limit_event',
      rate_limit_info: rateLimitInfo,
      uuid: '00000000-0000-4000-8000-000000000001',
      session_id: 'test-session',
      additional_metadata: { preserve: true },
    };
    const emitStreamEvent = createEmitStreamEvent({
      state: createClaudeStreamEventState(),
      emit: event => emitted.push(event),
      emitWarning: () => {},
      emitTerminalError: error => terminalErrors.push(error),
      onCompactionBoundary: () => {},
      toCommonName: name => name,
    });

    emitStreamEvent(message);

    expect(emitted).toEqual([
      { type: 'stream-start' },
      { type: 'raw', rawValue: message },
    ]);
    expect(terminalErrors).toEqual([]);
  });

  it('forwards a usage-bearing raw message_stop for each response', () => {
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
        type: 'message_start',
        message: {
          usage: {
            input_tokens: 2,
            cache_creation_input_tokens: 3,
            cache_read_input_tokens: 5,
          },
        },
      },
    });
    emitStreamEvent({
      type: 'stream_event',
      event: {
        type: 'message_delta',
        usage: { output_tokens: 7 },
      },
    });
    emitStreamEvent({
      type: 'stream_event',
      event: { type: 'message_stop' },
    });
    emitStreamEvent({
      type: 'stream_event',
      event: {
        type: 'message_delta',
        usage: { input_tokens: 11, output_tokens: 13 },
      },
    });
    emitStreamEvent({
      type: 'stream_event',
      event: { type: 'message_stop' },
    });

    expect(
      emitted.filter(
        event =>
          event.type === 'raw' &&
          (event.rawValue as ClaudeMessage).event?.type === 'message_stop',
      ),
    ).toEqual([
      {
        type: 'raw',
        rawValue: {
          type: 'stream_event',
          event: { type: 'message_stop' },
          usage: {
            input_tokens: 2,
            cache_creation_input_tokens: 3,
            cache_read_input_tokens: 5,
            output_tokens: 7,
          },
        },
      },
      {
        type: 'raw',
        rawValue: {
          type: 'stream_event',
          event: { type: 'message_stop' },
          usage: {
            input_tokens: 11,
            output_tokens: 13,
          },
        },
      },
    ]);
    expect(emitted).not.toContainEqual(
      expect.objectContaining({ type: 'finish-step' }),
    );
  });

  it('ignores user messages with string content', () => {
    const state = createClaudeStreamEventState();
    state.stepOpen = true;
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
      type: 'user',
      message: { content: 'Compacted conversation context' },
    });

    expect(emitted).toEqual([{ type: 'stream-start' }]);
    expect(state.stepOpen).toBe(true);
  });

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
          "input": "{"command":"pwd"}",
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

  it.each(['before', 'after'] as const)(
    'uses message delta usage when it arrives $order the assistant message',
    order => {
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
      const assistantMessage: ClaudeMessage = {
        type: 'assistant',
        message: {
          usage: {
            input_tokens: 10,
            cache_creation_input_tokens: 20,
            cache_read_input_tokens: 30,
            output_tokens: 0,
          },
          content: [
            {
              type: 'tool_use',
              id: 'tool-1',
              name: 'Bash',
              input: { command: 'pwd' },
            },
          ],
        },
      };
      const messageDelta: ClaudeMessage = {
        type: 'stream_event',
        event: {
          type: 'message_delta',
          usage: {
            output_tokens: 40,
          },
        },
      };

      for (const message of order === 'before'
        ? [messageDelta, assistantMessage]
        : [assistantMessage, messageDelta]) {
        emitStreamEvent(message);
      }
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

      expect(
        emitted.find(event => event.type === 'finish-step')?.usage,
      ).toEqual({
        inputTokens: {
          total: 60,
          noCache: 10,
          cacheRead: 30,
          cacheWrite: 20,
        },
        outputTokens: { total: 40, text: 40 },
      });
    },
  );

  it('merges non-null usage fields across successive message deltas', () => {
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
        usage: {
          input_tokens: 1,
          cache_creation_input_tokens: 2,
          cache_read_input_tokens: 3,
          output_tokens: 4,
        },
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
    for (const usage of [
      {
        input_tokens: 10,
        output_tokens: 30,
      },
      {
        cache_creation_input_tokens: 20,
        output_tokens: 50,
      },
      {
        input_tokens: null,
        cache_creation_input_tokens: null,
        cache_read_input_tokens: null,
        output_tokens: 60,
      },
    ]) {
      emitStreamEvent({
        type: 'stream_event',
        event: { type: 'message_delta', usage },
      });
    }
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

    expect(emitted.find(event => event.type === 'finish-step')?.usage).toEqual({
      inputTokens: {
        total: 33,
        noCache: 10,
        cacheRead: 3,
        cacheWrite: 20,
      },
      outputTokens: { total: 60, text: 60 },
    });
  });

  it.each([
    { order: 'tool-result-first', outputOnly: false },
    { order: 'delta-first', outputOnly: false },
    { order: 'stop-first', outputOnly: false },
    { order: 'tool-result-first', outputOnly: true },
    { order: 'delta-first', outputOnly: true },
    { order: 'stop-first', outputOnly: true },
  ] as const)(
    'keeps response usage on its own step: $order, outputOnly=$outputOnly',
    ({ order, outputOnly }) => {
      const emitted: Record<string, unknown>[] = [];
      const receive = createEmitStreamEvent({
        state: createClaudeStreamEventState(),
        emit: event => emitted.push(event),
        emitWarning: () => {},
        emitTerminalError: () => {},
        onCompactionBoundary: () => {},
        toCommonName: name => name.toLowerCase(),
      });
      const initial = [
        {
          input_tokens: 10,
          cache_creation_input_tokens: 20,
          cache_read_input_tokens: 30,
          output_tokens: 3,
        },
        {
          input_tokens: 40,
          cache_creation_input_tokens: 50,
          cache_read_input_tokens: 60,
          output_tokens: 3,
        },
      ];
      const final = [
        {
          input_tokens: 110,
          cache_creation_input_tokens: 220,
          cache_read_input_tokens: 330,
          output_tokens: 295,
        },
        {
          input_tokens: 140,
          cache_creation_input_tokens: 250,
          cache_read_input_tokens: 360,
          output_tokens: 233,
        },
      ];
      const stream = (
        event: NonNullable<ClaudeMessage['event']>,
      ): ClaudeMessage => ({
        type: 'stream_event',
        parent_tool_use_id: null,
        event,
      });

      for (let response = 0; response < 2; response++) {
        receive(
          stream({
            type: 'message_start',
            message: { usage: initial[response] },
          }),
        );
        for (let index = 0; index < 2; index++) {
          const id = `response-${response}-tool-${index}`;
          receive(
            stream({
              type: 'content_block_start',
              index,
              content_block: { type: 'tool_use', id, name: 'Read' },
            }),
          );
          receive({
            type: 'assistant',
            parent_tool_use_id: null,
            message: {
              usage: initial[response],
              content: [
                {
                  type: 'tool_use',
                  id,
                  name: 'Read',
                  input: { file_path: 'fixture.txt' },
                },
              ],
            },
          });
          receive(stream({ type: 'content_block_stop', index }));
        }
        const results: ClaudeMessage[] = [0, 1].map(index => ({
          type: 'user',
          parent_tool_use_id: null,
          message: {
            content: [
              {
                type: 'tool_result',
                tool_use_id: `response-${response}-tool-${index}`,
                content: 'ok',
              },
            ],
          },
        }));
        const delta = stream({
          type: 'message_delta',
          usage: outputOnly
            ? { output_tokens: final[response].output_tokens }
            : final[response],
        });
        const stop = stream({ type: 'message_stop' });
        for (const message of order === 'tool-result-first'
          ? [...results, delta, stop]
          : order === 'delta-first'
            ? [delta, ...results, stop]
            : [delta, stop, ...results]) {
          receive(message);
        }
      }

      const expected = (outputOnly ? initial : final).map((usage, index) => ({
        inputTokens: {
          total:
            usage.input_tokens +
            usage.cache_creation_input_tokens +
            usage.cache_read_input_tokens,
          noCache: usage.input_tokens,
          cacheRead: usage.cache_read_input_tokens,
          cacheWrite: usage.cache_creation_input_tokens,
        },
        outputTokens: {
          total: final[index].output_tokens,
          text: final[index].output_tokens,
        },
      }));
      expect(
        emitted
          .filter(event => event.type === 'finish-step')
          .map(event => event.usage),
      ).toEqual(expected);
      expect(
        emitted
          .filter(event => {
            const raw = event.rawValue as ClaudeMessage | undefined;
            return (
              event.type === 'raw' &&
              raw?.type === 'stream_event' &&
              raw.parent_tool_use_id == null &&
              raw.event?.type === 'message_stop'
            );
          })
          .map(event => (event.rawValue as ClaudeMessage).usage),
      ).toEqual(
        final.map((usage, index) =>
          outputOnly
            ? { ...initial[index], output_tokens: usage.output_tokens }
            : usage,
        ),
      );
    },
  );

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

  it('forwards subagent and task activity as raw parts', () => {
    const messages = JSON.parse(
      readFileSync(
        new URL('./__fixtures__/subagent-task-stream.json', import.meta.url),
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
      toCommonName: name => name,
    });

    for (const message of messages) {
      emitStreamEvent(message);
    }

    const rawValues = emitted
      .filter(event => event.type === 'raw')
      .map(event => event.rawValue);
    const expectedRawValues = messages.filter(
      message =>
        message.parent_tool_use_id != null ||
        (message.type === 'system' &&
          [
            'background_tasks_changed',
            'task_started',
            'task_progress',
            'task_updated',
            'task_notification',
          ].includes(message.subtype ?? '')),
    );

    expect(
      emitted.some(
        event =>
          event.type === 'tool-call' &&
          event.toolCallId === 'toolu_parent_agent',
      ),
    ).toBe(true);
    expect(rawValues).toEqual(expectedRawValues);
  });

  it('preserves failed task terminal error handling', () => {
    const terminalErrors: Array<string | undefined> = [];
    const emitted: Record<string, unknown>[] = [];
    const emitStreamEvent = createEmitStreamEvent({
      state: createClaudeStreamEventState(),
      emit: event => emitted.push(event),
      emitWarning: () => {},
      emitTerminalError: error => terminalErrors.push(error),
      onCompactionBoundary: () => {},
      toCommonName: name => name,
    });

    emitStreamEvent({
      type: 'system',
      subtype: 'task_updated',
      patch: { status: 'failed', error: 'subagent failed' },
    });

    expect(terminalErrors).toEqual(['subagent failed']);
    expect(emitted).toEqual([{ type: 'stream-start' }]);
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
    state.mcpHandlerCalls.set('host-tool', {
      toolName: 'weather',
      input: {},
    });
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
          "input": "{"libraryId":"/vercel/next.js"}",
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

  it('reports a host tool rejected before its MCP handler runs', () => {
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
            tool_use_id: 'host-tool',
            content: 'Input validation error: city is required',
            is_error: true,
          },
        ],
      },
    });

    expect(
      emitted.filter(
        event => event.type === 'tool-call' || event.type === 'tool-result',
      ),
    ).toEqual([
      {
        type: 'tool-call',
        toolCallId: 'host-tool',
        toolName: 'weather',
        input: '{}',
        providerExecuted: false,
      },
      {
        type: 'tool-result',
        toolCallId: 'host-tool',
        toolName: 'weather',
        result: 'Input validation error: city is required',
        isError: true,
      },
    ]);
  });

  it('deduplicates host tool results when handler metadata cannot be matched', () => {
    const state = createClaudeStreamEventState();
    state.mcpHandlerCalls.set('unmatched-handler-id', {
      toolName: 'weather',
      input: { city: 'Tokyo' },
    });
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
            id: 'host-tool',
            name: 'mcp__harness-tools__weather',
            input: { city: 'Tokyo' },
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
    ).toEqual([]);
    expect(state.mcpHandlerCalls).toHaveLength(0);
  });

  it.each(['first', 'unmatched'])(
    'does not reuse a %s handler for identical parallel declarations',
    handlerId => {
      const state = createClaudeStreamEventState();
      state.mcpHandlerCalls.set(handlerId, {
        toolName: 'weather',
        input: { city: 'Tokyo' },
      });
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
          content: ['first', 'second'].map(id => ({
            type: 'tool_use',
            id,
            name: 'mcp__harness-tools__weather',
            input: { city: 'Tokyo' },
          })),
        },
      });
      expect(
        emitted
          .filter(event => event.type === 'tool-call')
          .map(event => event.toolCallId),
      ).toEqual(['second']);
      expect([...state.hostInputWaitingToolUseIds]).toEqual(['second']);
    },
  );

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

  it('batches host calls before sequential MCP handlers start without repeating the boundary', () => {
    const state = createClaudeStreamEventState();
    const emitted: Record<string, unknown>[] = [];
    const emit = (event: Record<string, unknown>) => emitted.push(event);
    const emitStreamEvent = createEmitStreamEvent({
      state,
      emit,
      emitWarning: () => {},
      emitTerminalError: () => {},
      onCompactionBoundary: () => {},
      toCommonName: name => name,
    });
    const finishSteps = () =>
      emitted.filter(event => event.type === 'finish-step');

    emitStreamEvent({ type: 'stream_event', event: { type: 'message_start' } });
    emitStreamEvent({
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            id: 'toolu_paris',
            name: 'mcp__harness-tools__get_weather',
            input: { city: 'Paris' },
          },
        ],
      },
    });
    markWaitingOnHostInput({ state, emit, toolUseId: 'toolu_paris' });
    emitStreamEvent({
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            id: 'toolu_tokyo',
            name: 'mcp__harness-tools__get_weather',
            input: { city: 'Tokyo' },
          },
        ],
      },
    });

    expect(finishSteps()).toHaveLength(0);

    emitStreamEvent({ type: 'stream_event', event: { type: 'message_stop' } });

    expect(finishSteps()).toHaveLength(1);

    clearWaitingOnHostInput({ state, toolUseId: 'toolu_paris' });
    state.mcpHandlerCalls.set('toolu_tokyo', {
      toolName: 'get_weather',
      input: { city: 'Tokyo' },
    });
    markWaitingOnHostInput({ state, emit, toolUseId: 'toolu_tokyo' });

    expect(finishSteps()).toHaveLength(1);
    expect(
      emitted
        .filter(event => event.type === 'tool-call')
        .map(event => event.toolCallId),
    ).toEqual(['toolu_paris', 'toolu_tokyo']);

    clearWaitingOnHostInput({ state, toolUseId: 'toolu_tokyo' });
    emitStreamEvent({
      type: 'user',
      message: {
        content: [
          { type: 'tool_result', tool_use_id: 'toolu_paris', content: '{}' },
          { type: 'tool_result', tool_use_id: 'toolu_tokyo', content: '{}' },
        ],
      },
    });

    expect(
      finishSteps().map(event => (event.finishReason as { raw: string }).raw),
    ).toEqual(['host-input', 'stop']);
  });

  it('pauses for native approvals even when another native call is queued', () => {
    const state = createClaudeStreamEventState();
    const emitted: Record<string, unknown>[] = [];
    const emit = (event: Record<string, unknown>) => emitted.push(event);
    const emitStreamEvent = createEmitStreamEvent({
      state,
      emit,
      emitWarning: () => {},
      emitTerminalError: () => {},
      onCompactionBoundary: () => {},
      toCommonName: name => name,
    });
    emitStreamEvent({ type: 'stream_event', event: { type: 'message_start' } });
    emitStreamEvent({
      type: 'assistant',
      message: {
        content: ['first', 'second'].map(id => ({
          type: 'tool_use',
          id,
          name: 'Bash',
          input: { command: 'pwd' },
        })),
      },
    });
    markWaitingOnHostInput({ state, emit, toolUseId: 'first' });
    expect(emitted.filter(event => event.type === 'finish-step')).toHaveLength(
      0,
    );
    emitStreamEvent({ type: 'stream_event', event: { type: 'message_stop' } });
    expect(emitted.filter(event => event.type === 'finish-step')).toHaveLength(
      1,
    );
    clearWaitingOnHostInput({ state, toolUseId: 'first' });
    markWaitingOnHostInput({ state, emit, toolUseId: 'second' });
    expect(emitted.filter(event => event.type === 'finish-step')).toHaveLength(
      2,
    );
    clearWaitingOnHostInput({ state, toolUseId: 'second' });
    emitStreamEvent({
      type: 'user',
      message: {
        content: ['first', 'second'].map(id => ({
          type: 'tool_result',
          tool_use_id: id,
          content: '/work',
        })),
      },
    });
    expect(
      emitted
        .filter(event => event.type === 'finish-step')
        .map(event => (event.finishReason as { raw: string }).raw),
    ).toEqual(['host-input', 'host-input', 'stop']);
  });
});
