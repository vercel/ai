import type { BridgeEvent } from '@ai-sdk/harness/bridge';
import { describe, expect, it } from 'vitest';
import { createCodexStepTracker } from './codex-step-tracker';

function createTracker() {
  const events: BridgeEvent[] = [];
  return {
    events,
    tracker: createCodexStepTracker({
      send: event => events.push(event),
    }),
  };
}

describe('createCodexStepTracker', () => {
  it('keeps a model text step open until turn end', () => {
    const { events, tracker } = createTracker();

    tracker.observeEvent({
      event: {
        type: 'item.completed',
        item: { type: 'agent_message' },
      },
      itemId: 'item_0',
    });

    expect(events).toEqual([]);

    tracker.finishTurn();

    expect(events.map(event => event.type)).toEqual(['finish-step']);
  });

  it('closes a step after a tool call/result item completes', () => {
    const { events, tracker } = createTracker();

    tracker.observeEvent({
      event: {
        type: 'item.started',
        item: { type: 'command_execution' },
      },
      itemId: 'item_1',
    });
    tracker.observeEvent({
      event: {
        type: 'item.completed',
        item: { type: 'command_execution' },
      },
      itemId: 'item_1',
    });

    expect(events.map(event => event.type)).toEqual(['finish-step']);
  });

  it('tracks app-server dynamic tool item lifecycles', () => {
    const { events, tracker } = createTracker();

    tracker.observeEvent({
      event: { type: 'item.started', item: { type: 'dynamic_tool_call' } },
      itemId: 'dynamic_1',
    });
    tracker.observeEvent({
      event: { type: 'item.completed', item: { type: 'dynamic_tool_call' } },
      itemId: 'dynamic_1',
    });

    expect(events.map(event => event.type)).toEqual(['finish-step']);
  });

  it('keeps a native tool step open until its result even when typed items share the call id', () => {
    const { events, tracker } = createTracker();

    tracker.observeEvent({
      event: { type: 'item.started', item: { type: 'native_tool' } },
      itemId: 'native-tool:call-1',
    });
    tracker.observeEvent({
      event: { type: 'item.started', item: { type: 'file_change' } },
      itemId: 'call-1',
    });
    tracker.observeEvent({
      event: { type: 'item.completed', item: { type: 'file_change' } },
      itemId: 'call-1',
    });
    expect(events).toEqual([]);

    tracker.observeEvent({
      event: { type: 'item.completed', item: { type: 'native_tool' } },
      itemId: 'native-tool:call-1',
    });
    expect(events.map(event => event.type)).toEqual(['finish-step']);
  });

  it('does not close a step while a tool item is still pending', () => {
    const { events, tracker } = createTracker();

    tracker.observeEvent({
      event: {
        type: 'item.started',
        item: { type: 'command_execution' },
      },
      itemId: 'item_2',
    });
    tracker.observeEvent({
      event: {
        type: 'item.completed',
        item: { type: 'agent_message' },
      },
      itemId: 'item_3',
    });

    expect(events).toEqual([]);

    tracker.observeEvent({
      event: {
        type: 'item.completed',
        item: { type: 'command_execution' },
      },
      itemId: 'item_2',
    });

    expect(events.map(event => event.type)).toEqual(['finish-step']);
  });

  it('closes a pending tool step at turn end', () => {
    const { events, tracker } = createTracker();

    tracker.observeEvent({
      event: {
        type: 'item.started',
        item: { type: 'command_execution' },
      },
      itemId: 'item_2',
    });

    tracker.finishTurn();

    expect(events.map(event => event.type)).toEqual(['finish-step']);
  });

  it('closes a final model text step at turn end after a tool step', () => {
    const { events, tracker } = createTracker();

    tracker.observeEvent({
      event: {
        type: 'item.started',
        item: { type: 'command_execution' },
      },
      itemId: 'item_1',
    });
    tracker.observeEvent({
      event: {
        type: 'item.completed',
        item: { type: 'command_execution' },
      },
      itemId: 'item_1',
    });
    tracker.observeEvent({
      event: {
        type: 'item.completed',
        item: { type: 'agent_message' },
      },
      itemId: 'item_2',
    });

    expect(events.map(event => event.type)).toEqual(['finish-step']);

    tracker.finishTurn();

    expect(events.map(event => event.type)).toEqual([
      'finish-step',
      'finish-step',
    ]);
  });

  it('reports each step as the usage consumed since the previous step', () => {
    const events: BridgeEvent[] = [];
    const usage = (input: number, output: number) => ({
      inputTokens: {
        total: input,
        noCache: input,
        cacheRead: 0,
        cacheWrite: 0,
      },
      outputTokens: { total: output, text: output },
    });
    let turnUsage: Record<string, unknown> = usage(0, 0);
    const tracker = createCodexStepTracker({
      send: event => events.push(event),
      getTurnUsage: () => turnUsage,
    });
    const runToolStep = (id: string) => {
      tracker.observeEvent({
        event: { type: 'item.started', item: { type: 'command_execution' } },
        itemId: id,
      });
      tracker.observeEvent({
        event: { type: 'item.completed', item: { type: 'command_execution' } },
        itemId: id,
      });
    };

    turnUsage = usage(10, 3);
    runToolStep('a');
    turnUsage = usage(25, 9);
    runToolStep('b');

    expect(
      events.map(event => (event.type === 'finish-step' ? event.usage : null)),
    ).toEqual([usage(10, 3), usage(15, 6)]);
  });
});
