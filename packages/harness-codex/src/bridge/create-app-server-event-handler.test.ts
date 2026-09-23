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
});

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
