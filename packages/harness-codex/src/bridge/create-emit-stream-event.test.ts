import { describe, expect, it } from 'vitest';
import type { CodexStepTracker } from './codex-step-tracker';
import { createEmitStreamEvent } from './create-emit-stream-event';

describe('createEmitStreamEvent', () => {
  it('emits thread, accumulated text, and usage events', () => {
    const emitted: Record<string, unknown>[] = [];
    const observed: unknown[] = [];
    const usages: unknown[] = [];
    const threadIds: string[] = [];
    const stepTracker = {
      observeEvent: input => observed.push(input),
      finishStep: () => observed.push('finish'),
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

  it('preserves command and MCP result translation', () => {
    const emitted: Record<string, unknown>[] = [];
    const stepTracker = {
      observeEvent: () => {},
      finishStep: () => {},
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
          "input": "{\"command\":\"pwd\"}",
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
});
