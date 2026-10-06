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
};

export function createCodexStepTracker(input: {
  send: Emit;
  /**
   * Returns the turn's cumulative usage so far. Each inferred step reports the
   * tokens consumed since the previous step, so usage reaches the host while
   * the turn is still running (and survives an abort or failure).
   */
  getTurnUsage?: () => Record<string, unknown>;
}): CodexStepTracker {
  let stepOpen = false;
  let reportedUsage: Record<string, unknown> = defaultUsage();
  const pendingToolItemIds = new Set<string>();

  const hasUnreportedUsage = (): boolean => {
    const delta = subtractUsage(
      input.getTurnUsage?.() ?? reportedUsage,
      reportedUsage,
    );
    return [delta.inputTokens, delta.outputTokens].some(counts =>
      Object.values(counts).some(count => (count ?? 0) > 0),
    );
  };

  const finishStep = (): void => {
    if (!stepOpen || pendingToolItemIds.size > 0) return;
    const turnUsage = input.getTurnUsage?.() ?? reportedUsage;
    const usage = subtractUsage(turnUsage, reportedUsage);
    reportedUsage = turnUsage;
    input.send({
      type: 'finish-step',
      finishReason: { unified: 'stop', raw: 'stop' },
      usage,
      harnessMetadata: { codex: { inferredStep: true } },
    });
    stepOpen = false;
  };

  return {
    observeEvent({ event, itemId }) {
      const item = event.item;
      if (!item || !isStepItem(item)) return;

      stepOpen = true;

      if (isToolStepItem(item)) {
        if (event.type === 'item.started' && itemId) {
          pendingToolItemIds.add(itemId);
        } else if (event.type === 'item.completed') {
          if (itemId) pendingToolItemIds.delete(itemId);
          finishStep();
        }
      }
    },
    finishTurn() {
      pendingToolItemIds.clear();
      // Usage can arrive with no step open (e.g. only sub-agents ran); report
      // it rather than dropping it.
      if (!stepOpen && hasUnreportedUsage()) stepOpen = true;
      finishStep();
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

type UsageCounts = Record<string, number | undefined>;

function subtractUsage(
  current: Record<string, unknown>,
  previous: Record<string, unknown>,
): { inputTokens: UsageCounts; outputTokens: UsageCounts } {
  const diff = (key: 'inputTokens' | 'outputTokens'): UsageCounts => {
    const now = (current[key] ?? {}) as UsageCounts;
    const before = (previous[key] ?? {}) as UsageCounts;
    return Object.fromEntries(
      Object.entries(now).map(([field, value]) => [
        field,
        Math.max(0, (value ?? 0) - (before[field] ?? 0)),
      ]),
    );
  };
  return {
    inputTokens: diff('inputTokens'),
    outputTokens: diff('outputTokens'),
  };
}
