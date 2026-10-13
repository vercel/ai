import { describe, expect, it } from 'vitest';
import type { CodexStepTracker } from './codex-step-tracker';
import { createEmitStreamEvent } from './create-emit-stream-event';

describe('createEmitStreamEvent', () => {
  it('preserves failed MCP status and native ids for interleaved calls', () => {
    const emitted: Record<string, unknown>[] = [];
    const emitStreamEvent = createEmitStreamEvent({
      send: event => emitted.push(event),
      stepTracker: { observeEvent() {}, finishTurn() {} } as CodexStepTracker,
      setTurnUsage() {},
      setThreadId() {},
      emitWarning() {},
      emitError() {},
    });
    const items = [
      {
        type: 'mcp_tool_call',
        id: 'failed',
        server: 'fixture',
        tool: 'fail',
        arguments: { exact: true },
      },
      {
        type: 'mcp_tool_call',
        id: 'success',
        server: 'fixture',
        tool: 'ok',
        arguments: {},
      },
      {
        type: 'mcp_tool_call',
        id: 'empty-failure',
        server: 'fixture',
        tool: 'fail',
        arguments: {},
      },
    ];
    for (const item of items) emitStreamEvent({ type: 'item.started', item });
    emitStreamEvent({
      type: 'item.completed',
      item: {
        ...items[1],
        status: 'completed',
        result: { structured_content: { ok: true } },
      },
    });
    emitStreamEvent({
      type: 'item.completed',
      item: {
        ...items[0],
        status: 'failed',
        error: { message: 'native failure' },
      },
    });
    emitStreamEvent({
      type: 'item.completed',
      item: { ...items[2], status: 'failed' },
    });
    expect(
      emitted
        .filter(event => event.type === 'tool-call')
        .map(event => event.toolCallId),
    ).toEqual(['failed', 'success', 'empty-failure']);
    expect(emitted.filter(event => event.type === 'tool-result')).toEqual([
      {
        type: 'tool-result',
        toolCallId: 'success',
        toolName: 'mcp__fixture__ok',
        result: { ok: true },
        dynamic: true,
      },
      {
        type: 'tool-result',
        toolCallId: 'failed',
        toolName: 'mcp__fixture__fail',
        result: { error: 'native failure' },
        isError: true,
        dynamic: true,
      },
      {
        type: 'tool-result',
        toolCallId: 'empty-failure',
        toolName: 'mcp__fixture__fail',
        result: null,
        isError: true,
        dynamic: true,
      },
    ]);
  });

  it('emits thread, accumulated text, and usage events', () => {
    const emitted: Record<string, unknown>[] = [];
    const observed: unknown[] = [];
    const usages: unknown[] = [];
    const threadIds: string[] = [];
    const stepTracker = {
      observeEvent: input => observed.push(input),
      finishTurn: () => observed.push('finish'),
    } as CodexStepTracker;
    const emitStreamEvent = createEmitStreamEvent({
      send: event => emitted.push(event),
      stepTracker,
      setTurnUsage: usage => usages.push(usage),
      setThreadId: threadId => threadIds.push(threadId),
      emitWarning: () => {},
      emitError: () => {},
    });

    emitStreamEvent({ type: 'thread.started', thread_id: 'thread-1' });
    emitStreamEvent({
      type: 'item.updated',
      item: { type: 'agent_message', id: 'message-1', text: 'hello' },
    });
    emitStreamEvent({
      type: 'item.completed',
      item: {
        type: 'agent_message',
        id: 'message-1',
        text: 'hello world',
      },
    });
    emitStreamEvent({
      type: 'turn.completed',
      usage: {
        input_tokens: 5,
        cached_input_tokens: 2,
        output_tokens: 3,
      },
    });

    expect({ emitted, usages, threadIds, observed }).toMatchInlineSnapshot(`
      {
        "emitted": [
          {
            "threadId": "thread-1",
            "type": "bridge-thread",
          },
          {
            "id": "message-1",
            "type": "text-start",
          },
          {
            "delta": "hello",
            "id": "message-1",
            "type": "text-delta",
          },
          {
            "delta": " world",
            "id": "message-1",
            "type": "text-delta",
          },
          {
            "id": "message-1",
            "type": "text-end",
          },
        ],
        "observed": [
          {
            "event": {
              "item": {
                "id": "message-1",
                "text": "hello",
                "type": "agent_message",
              },
              "type": "item.updated",
            },
            "itemId": "message-1",
          },
          {
            "event": {
              "item": {
                "id": "message-1",
                "text": "hello world",
                "type": "agent_message",
              },
              "type": "item.completed",
            },
            "itemId": "message-1",
          },
          "finish",
        ],
        "threadIds": [
          "thread-1",
        ],
        "usages": [
          {
            "inputTokens": {
              "cacheRead": 2,
              "cacheWrite": 0,
              "noCache": 3,
              "total": 5,
            },
            "outputTokens": {
              "text": 3,
              "total": 3,
            },
          },
        ],
      }
    `);
  });

  it('emits accumulated reasoning summary events', () => {
    const emitted: Record<string, unknown>[] = [];
    const stepTracker = {
      observeEvent: () => {},
      finishTurn: () => {},
    } as CodexStepTracker;
    const emitStreamEvent = createEmitStreamEvent({
      send: event => emitted.push(event),
      stepTracker,
      setTurnUsage: () => {},
      setThreadId: () => {},
      emitWarning: () => {},
      emitError: () => {},
    });

    emitStreamEvent({
      type: 'item.updated',
      item: {
        type: 'reasoning',
        id: 'reasoning-1',
        text: 'Planning',
      },
    });
    emitStreamEvent({
      type: 'item.completed',
      item: {
        type: 'reasoning',
        id: 'reasoning-1',
        text: 'Planning the solution',
      },
    });

    expect(emitted).toMatchInlineSnapshot(`
      [
        {
          "id": "reasoning-1",
          "type": "reasoning-start",
        },
        {
          "delta": "Planning",
          "id": "reasoning-1",
          "type": "reasoning-delta",
        },
        {
          "delta": " the solution",
          "id": "reasoning-1",
          "type": "reasoning-delta",
        },
        {
          "id": "reasoning-1",
          "type": "reasoning-end",
        },
      ]
    `);
  });

  it('preserves command and MCP result translation', () => {
    const emitted: Record<string, unknown>[] = [];
    const stepTracker = {
      observeEvent: () => {},
      finishTurn: () => {},
    } as CodexStepTracker;
    const emitStreamEvent = createEmitStreamEvent({
      send: event => emitted.push(event),
      stepTracker,
      setTurnUsage: () => {},
      setThreadId: () => {},
      emitWarning: () => {},
      emitError: () => {},
    });

    emitStreamEvent({
      type: 'item.started',
      item: {
        type: 'command_execution',
        id: 'command-1',
        command: 'pwd',
      },
    });
    emitStreamEvent({
      type: 'item.completed',
      item: {
        type: 'command_execution',
        id: 'command-1',
        exit_code: 0,
        aggregated_output: '/tmp',
      },
    });
    emitStreamEvent({
      type: 'item.completed',
      item: {
        type: 'mcp_tool_call',
        id: 'mcp-1',
        tool: 'weather',
        result: { structured_content: { temperature: 72 } },
      },
    });

    expect(emitted).toMatchInlineSnapshot(`
      [
        {
          "input": "{"command":"pwd"}",
          "nativeName": "shell",
          "providerExecuted": true,
          "toolCallId": "command-1",
          "toolName": "bash",
          "type": "tool-call",
        },
        {
          "result": {
            "exitCode": 0,
            "output": "/tmp",
            "status": "completed",
          },
          "toolCallId": "command-1",
          "toolName": "bash",
          "type": "tool-result",
        },
        {
          "dynamic": true,
          "result": {
            "temperature": 72,
          },
          "toolCallId": "mcp-1",
          "toolName": "weather",
          "type": "tool-result",
        },
      ]
    `);
  });

  it('qualifies MCP tool names with their server identity', () => {
    const emitted: Record<string, unknown>[] = [];
    const stepTracker = {
      observeEvent: () => {},
      finishTurn: () => {},
    } as CodexStepTracker;
    const emitStreamEvent = createEmitStreamEvent({
      send: event => emitted.push(event),
      stepTracker,
      setTurnUsage: () => {},
      setThreadId: () => {},
      emitWarning: () => {},
      emitError: () => {},
    });

    emitStreamEvent({
      type: 'item.started',
      item: {
        type: 'mcp_tool_call',
        id: 'context7-call',
        server: 'context7',
        tool: 'query-docs',
        arguments: { libraryId: '/vercel/next.js' },
      },
    });
    emitStreamEvent({
      type: 'item.completed',
      item: {
        type: 'mcp_tool_call',
        id: 'context7-call',
        server: 'context7',
        tool: 'query-docs',
        result: { structured_content: { found: true } },
      },
    });
    emitStreamEvent({
      type: 'item.started',
      item: {
        type: 'mcp_tool_call',
        id: 'serverless-call',
        tool: 'query-docs',
        arguments: {},
      },
    });

    expect(emitted).toEqual([
      {
        type: 'tool-call',
        toolCallId: 'context7-call',
        toolName: 'mcp__context7__query-docs',
        nativeName: 'mcp__context7__query-docs',
        input: '{"libraryId":"/vercel/next.js"}',
        providerExecuted: true,
        dynamic: true,
      },
      {
        type: 'tool-result',
        toolCallId: 'context7-call',
        toolName: 'mcp__context7__query-docs',
        result: { found: true },
        dynamic: true,
      },
      {
        type: 'tool-call',
        toolCallId: 'serverless-call',
        toolName: 'query-docs',
        nativeName: 'query-docs',
        input: '{}',
        providerExecuted: true,
        dynamic: true,
      },
    ]);
  });

  it('emits native tool calls and real results with a distinct step tracker id', () => {
    const emitted: Record<string, unknown>[] = [];
    const observed: unknown[] = [];
    const stepTracker = {
      observeEvent: input => observed.push(input),
      finishTurn: () => {},
    } as CodexStepTracker;
    const emitStreamEvent = createEmitStreamEvent({
      send: event => emitted.push(event),
      stepTracker,
      setTurnUsage: () => {},
      setThreadId: () => {},
      emitWarning: () => {},
      emitError: () => {},
    });

    emitStreamEvent({
      type: 'item.started',
      item: {
        type: 'native_tool',
        id: 'patch-1',
        tool: 'apply_patch',
        input: JSON.stringify('*** Begin Patch\n*** End Patch'),
      },
    });
    emitStreamEvent({
      type: 'item.completed',
      item: {
        type: 'native_tool',
        id: 'patch-1',
        tool: 'apply_patch',
        result: 'Success. Updated notes.md',
      },
    });

    expect(emitted).toEqual([
      {
        type: 'tool-call',
        toolCallId: 'patch-1',
        toolName: 'apply_patch',
        input: JSON.stringify('*** Begin Patch\n*** End Patch'),
        providerExecuted: true,
      },
      {
        type: 'tool-result',
        toolCallId: 'patch-1',
        toolName: 'apply_patch',
        result: 'Success. Updated notes.md',
      },
    ]);
    expect(observed.map(value => (value as { itemId: string }).itemId)).toEqual(
      ['native-tool:patch-1', 'native-tool:patch-1'],
    );
  });

  it('preserves web search action metadata', () => {
    const emitted: Record<string, unknown>[] = [];
    const stepTracker = {
      observeEvent: () => {},
      finishTurn: () => {},
    } as CodexStepTracker;
    const emitStreamEvent = createEmitStreamEvent({
      send: event => emitted.push(event),
      stepTracker,
      setTurnUsage: () => {},
      setThreadId: () => {},
      emitWarning: () => {},
      emitError: () => {},
    });

    const action = {
      type: 'search',
      query: 'top news stories',
    };
    emitStreamEvent({
      type: 'item.started',
      item: {
        type: 'web_search',
        id: 'search-1',
        action,
      },
    });
    emitStreamEvent({
      type: 'item.completed',
      item: {
        type: 'web_search',
        id: 'search-1',
        action,
      },
    });

    expect(emitted).toEqual([
      {
        type: 'tool-call',
        toolCallId: 'search-1',
        toolName: 'webSearch',
        nativeName: 'web_search',
        input: JSON.stringify({ query: 'top news stories' }),
        providerExecuted: true,
      },
      {
        type: 'tool-result',
        toolCallId: 'search-1',
        toolName: 'webSearch',
        result: action,
      },
    ]);
  });

  it('defers web search tool calls until the query becomes available', () => {
    const emitted: Record<string, unknown>[] = [];
    const stepTracker = {
      observeEvent: () => {},
      finishTurn: () => {},
    } as CodexStepTracker;
    const emitStreamEvent = createEmitStreamEvent({
      send: event => emitted.push(event),
      stepTracker,
      setTurnUsage: () => {},
      setThreadId: () => {},
      emitWarning: () => {},
      emitError: () => {},
    });

    const action = {
      type: 'search',
      query: 'NPB September 15 2026 game results scores',
    };
    emitStreamEvent({
      type: 'item.started',
      item: {
        type: 'web_search',
        id: 'search-1',
      },
    });
    emitStreamEvent({
      type: 'item.updated',
      item: {
        type: 'web_search',
        id: 'search-1',
        action,
      },
    });
    emitStreamEvent({
      type: 'item.completed',
      item: {
        type: 'web_search',
        id: 'search-1',
        action,
      },
    });

    expect(emitted).toEqual([
      {
        type: 'tool-call',
        toolCallId: 'search-1',
        toolName: 'webSearch',
        nativeName: 'web_search',
        input: JSON.stringify({ query: action.query }),
        providerExecuted: true,
      },
      {
        type: 'tool-result',
        toolCallId: 'search-1',
        toolName: 'webSearch',
        result: action,
      },
    ]);
  });

  it('emits a deferred web search tool call when the query arrives on completion', () => {
    const emitted: Record<string, unknown>[] = [];
    const stepTracker = {
      observeEvent: () => {},
      finishTurn: () => {},
    } as CodexStepTracker;
    const emitStreamEvent = createEmitStreamEvent({
      send: event => emitted.push(event),
      stepTracker,
      setTurnUsage: () => {},
      setThreadId: () => {},
      emitWarning: () => {},
      emitError: () => {},
    });

    emitStreamEvent({
      type: 'item.started',
      item: {
        type: 'web_search',
        id: 'search-1',
      },
    });
    emitStreamEvent({
      type: 'item.completed',
      item: {
        type: 'web_search',
        id: 'search-1',
        query: 'latest AI SDK release',
      },
    });

    expect(emitted).toEqual([
      {
        type: 'tool-call',
        toolCallId: 'search-1',
        toolName: 'webSearch',
        nativeName: 'web_search',
        input: JSON.stringify({ query: 'latest AI SDK release' }),
        providerExecuted: true,
      },
      {
        type: 'tool-result',
        toolCallId: 'search-1',
        toolName: 'webSearch',
        result: null,
      },
    ]);
  });
});
