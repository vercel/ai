import { describe, expect, it, vi } from 'vitest';
import { createCodexStepTracker, defaultUsage } from './codex-step-tracker';
import { createAppServerEventHandler } from './create-app-server-event-handler';
import { createEmitStreamEvent } from './create-emit-stream-event';

describe('createAppServerEventHandler', () => {
  it('maps streamed items and accumulates every distinct model request usage', async () => {
    const emitted: Array<Record<string, unknown>> = [];
    let turnUsage: Record<string, unknown> = defaultUsage();
    const stepTracker = createCodexStepTracker({
      send: event => emitted.push(event),
    });
    const handler = createAppServerEventHandler({
      stepTracker,
      emitStreamEvent: createEmitStreamEvent({
        send: event => emitted.push(event),
        stepTracker,
        setTurnUsage: usage => (turnUsage = usage),
        setThreadId: () => {},
        emitWarning: vi.fn(),
        emitError: vi.fn(),
      }),
      emitWarning: vi.fn(),
      emitError: vi.fn(),
    });
    handler.announceThread('thread-1');
    handler.setTurnId('turn-1');

    handler.handle({
      method: 'item/started',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        item: { type: 'agentMessage', id: 'message-1', text: '' },
      },
    });
    handler.handle({
      method: 'item/agentMessage/delta',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        itemId: 'message-1',
        delta: 'Hello',
      },
    });
    handler.handle({
      method: 'item/completed',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        item: { type: 'agentMessage', id: 'message-1', text: 'Hello' },
      },
    });
    handler.handle({
      method: 'item/started',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        item: {
          type: 'dynamicToolCall',
          id: 'tool-item-1',
          tool: 'weather',
        },
      },
    });
    handler.handle({
      method: 'item/completed',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        item: {
          type: 'dynamicToolCall',
          id: 'tool-item-1',
          tool: 'weather',
        },
      },
    });

    const usage = ({
      total,
      last,
    }: {
      total: Record<string, number>;
      last: Record<string, number>;
    }) => ({
      method: 'thread/tokenUsage/updated',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        tokenUsage: { total, last, modelContextWindow: 100_000 },
      },
    });
    handler.handle(
      usage({
        total: usageBreakdown({ input: 10, cached: 2, output: 3 }),
        last: usageBreakdown({ input: 10, cached: 2, output: 3 }),
      }),
    );
    handler.handle(
      usage({
        total: usageBreakdown({ input: 10, cached: 2, output: 3 }),
        last: usageBreakdown({ input: 10, cached: 2, output: 3 }),
      }),
    );
    handler.handle(
      usage({
        total: usageBreakdown({ input: 17, cached: 3, output: 8 }),
        last: usageBreakdown({ input: 7, cached: 1, output: 5 }),
      }),
    );
    handler.handle({
      method: 'turn/completed',
      params: {
        threadId: 'thread-1',
        turn: { id: 'turn-1', status: 'completed', error: null },
        turnId: 'turn-1',
      },
    });

    expect(await handler.waitForCompletion()).toMatchInlineSnapshot(`
      {
        "status": "completed",
      }
    `);
    expect(turnUsage).toMatchInlineSnapshot(`
      {
        "inputTokens": {
          "cacheRead": 3,
          "cacheWrite": 0,
          "noCache": 14,
          "total": 17,
        },
        "outputTokens": {
          "text": 8,
          "total": 8,
        },
      }
    `);
    expect(emitted).toMatchInlineSnapshot(`
      [
        {
          "threadId": "thread-1",
          "type": "bridge-thread",
        },
        {
          "id": "message-1",
          "type": "text-start",
        },
        {
          "delta": "Hello",
          "id": "message-1",
          "type": "text-delta",
        },
        {
          "id": "message-1",
          "type": "text-end",
        },
        {
          "finishReason": {
            "raw": "stop",
            "unified": "stop",
          },
          "harnessMetadata": {
            "codex": {
              "inferredStep": true,
            },
          },
          "type": "finish-step",
          "usage": {
            "inputTokens": {
              "cacheRead": 0,
              "cacheWrite": 0,
              "noCache": 0,
              "total": 0,
            },
            "outputTokens": {
              "text": 0,
              "total": 0,
            },
          },
        },
      ]
    `);
  });

  it('emits a native patch call with the real result before finishing the step', () => {
    const { emitted, raw, item, complete } = createNativeToolHarness();
    const patch =
      '*** Begin Patch\n*** Update File: notes.md\n@@\n-old\n+new\n*** End Patch';

    raw({
      type: 'custom_tool_call',
      id: 'response-item-1',
      call_id: 'patch-1',
      name: 'apply_patch',
      input: patch,
    });
    item({
      type: 'fileChange',
      id: 'patch-1',
      status: 'completed',
      changes: [{ path: 'notes.md', kind: { type: 'update' } }],
    });
    expect(emitted.map(event => event.type)).toEqual([
      'bridge-thread',
      'tool-call',
      'file-change',
    ]);

    raw({
      type: 'custom_tool_call_output',
      call_id: 'patch-1',
      output: 'Success. Updated notes.md',
    });
    complete();

    expect(emitted.slice(1, 4)).toEqual([
      {
        type: 'tool-call',
        toolCallId: 'patch-1',
        toolName: 'apply_patch',
        input: JSON.stringify(patch),
        providerExecuted: true,
      },
      { type: 'file-change', event: 'modify', path: 'notes.md' },
      {
        type: 'tool-result',
        toolCallId: 'patch-1',
        toolName: 'apply_patch',
        result: 'Success. Updated notes.md',
      },
    ]);
    expect(emitted[4]?.type).toBe('finish-step');
  });

  it('passes through real image content and identifies native image errors', () => {
    const { emitted, raw, item, complete } = createNativeToolHarness();
    const args = JSON.stringify({ path: 'image.png', detail: 'high' });
    const image = [
      {
        type: 'input_image',
        image_url: 'data:image/png;base64,aGVsbG8=',
        detail: 'high',
      },
    ];

    raw({
      type: 'function_call',
      call_id: 'image-1',
      name: 'view_image',
      arguments: args,
    });
    item({ type: 'imageView', id: 'image-1', path: 'image.png' });
    raw({
      type: 'function_call_output',
      call_id: 'image-1',
      output: image,
    });
    raw({
      type: 'function_call',
      call_id: 'image-2',
      name: 'view_image',
      arguments: JSON.stringify({ path: 'missing.png' }),
    });
    raw({
      type: 'function_call_output',
      call_id: 'image-2',
      output: 'unable to locate image at missing.png',
    });
    complete();

    expect(emitted.filter(event => event.type === 'tool-call')).toEqual([
      {
        type: 'tool-call',
        toolCallId: 'image-1',
        toolName: 'view_image',
        input: args,
        providerExecuted: true,
      },
      {
        type: 'tool-call',
        toolCallId: 'image-2',
        toolName: 'view_image',
        input: JSON.stringify({ path: 'missing.png' }),
        providerExecuted: true,
      },
    ]);
    expect(emitted.filter(event => event.type === 'tool-result')).toEqual([
      {
        type: 'tool-result',
        toolCallId: 'image-1',
        toolName: 'view_image',
        result: image,
      },
      {
        type: 'tool-result',
        toolCallId: 'image-2',
        toolName: 'view_image',
        result: 'unable to locate image at missing.png',
        isError: true,
      },
    ]);
  });

  it('uses acknowledgements only for confirmed success with missing media or results', () => {
    const { emitted, raw, item, complete } = createNativeToolHarness();

    raw({
      type: 'function_call',
      call_id: 'image-redacted',
      name: 'view_image',
      arguments: JSON.stringify({ path: 'image.png' }),
    });
    item({ type: 'imageView', id: 'image-redacted', path: 'image.png' });
    raw({
      type: 'function_call_output',
      call_id: 'image-redacted',
      output: [],
    });
    raw({
      type: 'custom_tool_call',
      call_id: 'patch-no-result',
      name: 'apply_patch',
      input: '*** Begin Patch\n*** Delete File: notes.md\n*** End Patch',
    });
    item({
      type: 'fileChange',
      id: 'patch-no-result',
      status: 'completed',
      changes: [],
    });
    raw({
      type: 'custom_tool_call',
      call_id: 'patch-no-status',
      name: 'apply_patch',
      input: 'invalid patch',
    });
    complete();

    expect(emitted.filter(event => event.type === 'tool-result')).toEqual([
      {
        type: 'tool-result',
        toolCallId: 'image-redacted',
        toolName: 'view_image',
        result: 'Image viewed.',
      },
      {
        type: 'tool-result',
        toolCallId: 'patch-no-result',
        toolName: 'apply_patch',
        result: 'Patch applied.',
      },
      {
        type: 'tool-result',
        toolCallId: 'patch-no-status',
        toolName: 'apply_patch',
        result: 'Codex did not report the tool result.',
        isError: true,
      },
    ]);
    expect(emitted.at(-1)?.type).toBe('finish-step');
  });

  it('surfaces patch failures using the real output', () => {
    const { emitted, raw, item, complete } = createNativeToolHarness();
    raw({
      type: 'custom_tool_call',
      call_id: 'patch-failed',
      name: 'apply_patch',
      input: '*** Begin Patch\n*** Delete File: missing.md\n*** End Patch',
    });
    item({
      type: 'fileChange',
      id: 'patch-failed',
      status: 'failed',
      changes: [],
    });
    raw({
      type: 'custom_tool_call_output',
      call_id: 'patch-failed',
      output: 'Failed to delete missing.md',
    });
    complete();

    expect(emitted.filter(event => event.type === 'tool-result')).toEqual([
      {
        type: 'tool-result',
        toolCallId: 'patch-failed',
        toolName: 'apply_patch',
        result: 'Failed to delete missing.md',
        isError: true,
      },
    ]);
  });

  it('ignores unrelated and stale items, and deduplicates native calls and results', () => {
    const { emitted, raw, item, complete } = createNativeToolHarness();
    const call = {
      type: 'function_call',
      call_id: 'image-1',
      name: 'view_image',
      arguments: JSON.stringify({ path: 'image.png' }),
    };
    raw({ ...call, threadId: 'different-thread' });
    raw({ ...call, turnId: 'different-turn' });
    raw({ ...call, namespace: 'external' });
    raw({ ...call, name: 'other_tool' });
    raw(call);
    raw(call);
    item({ type: 'imageView', id: 'image-1', path: 'image.png' });
    raw({ type: 'function_call_output', call_id: 'unknown', output: [] });
    raw({ type: 'custom_tool_call_output', call_id: 'image-1', output: [] });
    const output = {
      type: 'function_call_output',
      call_id: 'image-1',
      output: [],
    };
    raw(output);
    raw(output);
    complete();

    expect(emitted.filter(event => event.type === 'tool-call')).toHaveLength(1);
    expect(emitted.filter(event => event.type === 'tool-result')).toEqual([
      {
        type: 'tool-result',
        toolCallId: 'image-1',
        toolName: 'view_image',
        result: 'Image viewed.',
      },
    ]);
  });
});

function createNativeToolHarness() {
  const emitted: Array<Record<string, unknown>> = [];
  const stepTracker = createCodexStepTracker({
    send: event => emitted.push(event),
  });
  const handler = createAppServerEventHandler({
    stepTracker,
    emitStreamEvent: createEmitStreamEvent({
      send: event => emitted.push(event),
      stepTracker,
      setTurnUsage: () => {},
      setThreadId: () => {},
      emitWarning: vi.fn(),
      emitError: vi.fn(),
    }),
    emitWarning: vi.fn(),
    emitError: vi.fn(),
  });
  handler.announceThread('thread-1');
  handler.setTurnId('turn-1');
  return {
    emitted,
    raw: ({
      threadId = 'thread-1',
      turnId = 'turn-1',
      ...rawItem
    }: Record<string, unknown>) =>
      handler.handle({
        method: 'rawResponseItem/completed',
        params: { threadId, turnId, item: rawItem },
      }),
    item: (typedItem: Record<string, unknown>) =>
      handler.handle({
        method: 'item/completed',
        params: { threadId: 'thread-1', turnId: 'turn-1', item: typedItem },
      }),
    complete: () =>
      handler.handle({
        method: 'turn/completed',
        params: {
          threadId: 'thread-1',
          turnId: 'turn-1',
          turn: { id: 'turn-1', status: 'completed' },
        },
      }),
  };
}

function usageBreakdown({
  input,
  cached,
  output,
}: {
  input: number;
  cached: number;
  output: number;
}): Record<string, number> {
  return {
    totalTokens: input + output,
    inputTokens: input,
    cachedInputTokens: cached,
    cacheWriteInputTokens: 0,
    outputTokens: output,
    reasoningOutputTokens: 0,
  };
}
