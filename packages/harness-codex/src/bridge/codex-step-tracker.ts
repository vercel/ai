import type { BridgeEvent } from '@ai-sdk/harness/bridge';

type Emit = (msg: BridgeEvent) => void;

export type CodexStepTrackerItem = {
  type: string;
};

export type CodexStepTrackerEvent = {
  type: string;
  item?: CodexStepTrackerItem;
};

export type CodexStepTracker = {
  observeEvent(input: {
    event: CodexStepTrackerEvent;
    itemId: string | undefined;
  }): void;
  finishTurn(): void;
  awaitHostInput(input: { itemId: string }): void;
  resolveHostInput(input: { itemId: string }): void;
};

export function createCodexStepTracker(input: {
  send: Emit;
}): CodexStepTracker {
  let stepOpen = false;
  const pendingToolItemIds = new Set<string>();
  /*
   * Dynamic tool calls waiting for the host to return their result. When
   * every pending tool item waits on the host, Codex cannot make progress, so
   * the tracker emits an early `finish-step` that lets the host pause the
   * turn. The step stays open until the regular `finish-step`.
   */
  const hostInputWaitingItemIds = new Set<string>();
  const earlyFinishStepItemIds = new Set<string>();

  const finishStep = (): void => {
    if (!stepOpen || pendingToolItemIds.size > 0) return;
    input.send({
      type: 'finish-step',
      finishReason: { unified: 'stop', raw: 'stop' },
      usage: defaultUsage(),
      harnessMetadata: { codex: { inferredStep: true } },
    });
    stepOpen = false;
    earlyFinishStepItemIds.clear();
  };

  const emitEarlyFinishStepIfReady = (): void => {
    if (!stepOpen || pendingToolItemIds.size === 0) return;
    for (const itemId of pendingToolItemIds) {
      if (!hostInputWaitingItemIds.has(itemId)) return;
    }
    const uncovered = [...pendingToolItemIds].filter(
      itemId => !earlyFinishStepItemIds.has(itemId),
    );
    if (uncovered.length === 0) return;
    for (const itemId of uncovered) earlyFinishStepItemIds.add(itemId);
    input.send({
      type: 'finish-step',
      finishReason: { unified: 'tool-calls', raw: 'host-input' },
      usage: defaultUsage(),
      harnessMetadata: { codex: { inferredStep: true } },
    });
  };

  return {
    observeEvent({ event, itemId }) {
      const item = event.item;
      if (!item || !isStepItem(item)) return;

      stepOpen = true;

      if (isToolStepItem(item)) {
        if (event.type === 'item.started' && itemId) {
          pendingToolItemIds.add(itemId);
          emitEarlyFinishStepIfReady();
        } else if (event.type === 'item.completed') {
          if (itemId) pendingToolItemIds.delete(itemId);
          finishStep();
        }
      }
    },
    finishTurn() {
      pendingToolItemIds.clear();
      hostInputWaitingItemIds.clear();
      finishStep();
    },
    awaitHostInput({ itemId }) {
      stepOpen = true;
      pendingToolItemIds.add(itemId);
      hostInputWaitingItemIds.add(itemId);
      emitEarlyFinishStepIfReady();
    },
    resolveHostInput({ itemId }) {
      hostInputWaitingItemIds.delete(itemId);
    },
  };
}

function isStepItem(item: CodexStepTrackerItem): boolean {
  return isModelStepItem(item) || isToolStepItem(item);
}

function isModelStepItem(item: CodexStepTrackerItem): boolean {
  return item.type === 'reasoning' || item.type === 'agent_message';
}

function isToolStepItem(item: CodexStepTrackerItem): boolean {
  return (
    item.type === 'command_execution' ||
    item.type === 'native_tool' ||
    item.type === 'mcp_tool_call' ||
    item.type === 'dynamic_tool_call' ||
    item.type === 'web_search' ||
    item.type === 'file_change' ||
    item.type === 'todo_list'
  );
}

export function defaultUsage(): Record<string, unknown> {
  return {
    inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 0, text: 0 },
  };
}
