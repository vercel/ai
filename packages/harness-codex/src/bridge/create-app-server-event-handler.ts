import type { BridgeTurn } from '@ai-sdk/harness/bridge';
import type { CodexStepTracker } from './codex-step-tracker';
import type { CodexEvent, CodexItem } from './create-emit-stream-event';
import type { CodexAppServerNotification } from './codex-app-server-client';

type UsageBreakdown = {
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteInputTokens: number;
  outputTokens: number;
};

export type AppServerTurnResult = {
  status: string;
  error?: string;
};

export function createAppServerEventHandler({
  stepTracker,
  emitStreamEvent,
  emitWarning,
  emitError,
}: {
  stepTracker: CodexStepTracker;
  emitStreamEvent: (event: CodexEvent) => void;
  emitWarning: BridgeTurn['emitWarning'];
  emitError: BridgeTurn['emitError'];
}): {
  announceThread(threadId: string): void;
  handle(notification: CodexAppServerNotification): void;
  setTurnId(turnId: string): void;
  waitForCompletion(): Promise<AppServerTurnResult>;
} {
  let activeThreadId: string | undefined;
  let activeTurnId: string | undefined;
  let settled = false;
  let accumulatedUsage: UsageBreakdown = emptyUsageBreakdown();
  let lastCumulativeUsageKey: string | undefined;
  const textByItem = new Map<string, string>();
  const reasoningByItem = new Map<string, string>();
  let resolveCompletion: (result: AppServerTurnResult) => void = () => {};
  const completion = new Promise<AppServerTurnResult>(resolve => {
    resolveCompletion = resolve;
  });
  const announceThread = (threadId: string): void => {
    if (activeThreadId != null) return;
    activeThreadId = threadId;
    emitStreamEvent({ type: 'thread.started', thread_id: threadId });
  };

  const handleItem = ({
    eventType,
    params,
  }: {
    eventType: 'item.started' | 'item.completed';
    params: Record<string, unknown>;
  }): void => {
    if (!matchesActiveTurn({ params, activeThreadId, activeTurnId })) return;
    const item = asRecord(params.item);
    if (item == null || typeof item.type !== 'string') return;
    const normalized = normalizeItem({ item, textByItem, reasoningByItem });
    if (normalized == null) return;
    if (normalized.type === 'dynamic_tool_call') {
      stepTracker.observeEvent({
        event: { type: eventType, item: normalized },
        itemId: normalized.id,
      });
      return;
    }
    emitStreamEvent({ type: eventType, item: normalized });
  };

  return {
    announceThread,
    setTurnId(turnId) {
      activeTurnId = turnId;
    },
    handle(notification) {
      const params = asRecord(notification.params);
      if (notification.method === 'thread/started') {
        const thread = asRecord(params?.thread);
        if (typeof thread?.id === 'string') announceThread(thread.id);
        return;
      }
      if (notification.method === 'turn/started') {
        const turn = asRecord(params?.turn);
        if (
          params?.threadId === activeThreadId &&
          typeof turn?.id === 'string'
        ) {
          activeTurnId = turn.id;
        }
        return;
      }
      if (notification.method === 'item/started' && params != null) {
        handleItem({ eventType: 'item.started', params });
        return;
      }
      if (notification.method === 'item/completed' && params != null) {
        handleItem({ eventType: 'item.completed', params });
        return;
      }
      if (
        notification.method === 'item/agentMessage/delta' &&
        params != null &&
        matchesActiveTurn({ params, activeThreadId, activeTurnId }) &&
        typeof params.itemId === 'string' &&
        typeof params.delta === 'string'
      ) {
        const text = (textByItem.get(params.itemId) ?? '') + params.delta;
        textByItem.set(params.itemId, text);
        emitStreamEvent({
          type: 'item.updated',
          item: { type: 'agent_message', id: params.itemId, text },
        });
        return;
      }
      if (
        notification.method === 'item/reasoning/summaryTextDelta' &&
        params != null &&
        matchesActiveTurn({ params, activeThreadId, activeTurnId }) &&
        typeof params.itemId === 'string' &&
        typeof params.delta === 'string'
      ) {
        const text = (reasoningByItem.get(params.itemId) ?? '') + params.delta;
        reasoningByItem.set(params.itemId, text);
        emitStreamEvent({
          type: 'item.updated',
          item: { type: 'reasoning', id: params.itemId, text },
        });
        return;
      }
      if (
        notification.method === 'thread/tokenUsage/updated' &&
        params != null &&
        matchesActiveTurn({ params, activeThreadId, activeTurnId })
      ) {
        const tokenUsage = asRecord(params.tokenUsage);
        const total = readUsageBreakdown(tokenUsage?.total);
        const last = readUsageBreakdown(tokenUsage?.last);
        if (total != null && last != null) {
          const key = usageKey(total);
          if (key !== lastCumulativeUsageKey) {
            lastCumulativeUsageKey = key;
            accumulatedUsage = addUsage({
              total: accumulatedUsage,
              increment: last,
            });
          }
        }
        return;
      }
      if (notification.method === 'error' && params != null) {
        if (!matchesActiveTurn({ params, activeThreadId, activeTurnId }))
          return;
        const error = asRecord(params.error);
        const message =
          typeof error?.message === 'string'
            ? error.message
            : 'Codex app-server reported an error.';
        if (params.willRetry === true) {
          emitWarning({ message });
        } else {
          emitError({ error: message, message: 'codex turn failed' });
        }
        return;
      }
      if (
        (notification.method === 'warning' ||
          notification.method === 'configWarning' ||
          notification.method === 'deprecationNotice') &&
        typeof params?.message === 'string'
      ) {
        emitWarning({ message: params.message });
        return;
      }
      if (
        notification.method === 'turn/completed' &&
        params != null &&
        matchesActiveTurn({ params, activeThreadId, activeTurnId })
      ) {
        if (settled) return;
        settled = true;
        const turn = asRecord(params.turn);
        const status =
          typeof turn?.status === 'string' ? turn.status : 'failed';
        const turnError = asRecord(turn?.error);
        emitStreamEvent({
          type: 'turn.completed',
          usage: toLegacyUsage(accumulatedUsage),
        });
        resolveCompletion({
          status,
          ...(typeof turnError?.message === 'string'
            ? { error: turnError.message }
            : {}),
        });
      }
    },
    waitForCompletion: () => completion,
  };
}

function normalizeItem({
  item,
  textByItem,
  reasoningByItem,
}: {
  item: Record<string, unknown>;
  textByItem: Map<string, string>;
  reasoningByItem: Map<string, string>;
}): CodexItem | undefined {
  const id = typeof item.id === 'string' ? item.id : undefined;
  if (item.type === 'agentMessage') {
    const text = typeof item.text === 'string' ? item.text : '';
    if (id != null) textByItem.set(id, text);
    return { type: 'agent_message', id, text };
  }
  if (item.type === 'reasoning') {
    const summary = stringArray(item.summary).join('\n\n');
    const content = stringArray(item.content).join('\n\n');
    const text = summary || reasoningByItem.get(id ?? '') || content;
    if (id != null) reasoningByItem.set(id, text);
    return { type: 'reasoning', id, text };
  }
  if (item.type === 'commandExecution') {
    return {
      type: 'command_execution',
      id,
      command: typeof item.command === 'string' ? item.command : '',
      exit_code: typeof item.exitCode === 'number' ? item.exitCode : undefined,
      aggregated_output:
        typeof item.aggregatedOutput === 'string'
          ? item.aggregatedOutput
          : undefined,
      status: normalizeCommandStatus(item.status),
    };
  }
  if (item.type === 'mcpToolCall') {
    const result = asRecord(item.result);
    return {
      type: 'mcp_tool_call',
      id,
      server: typeof item.server === 'string' ? item.server : undefined,
      tool: typeof item.tool === 'string' ? item.tool : undefined,
      arguments: item.arguments,
      result:
        result == null
          ? item.result
          : {
              content: result.content,
              structured_content: result.structuredContent,
            },
      error: asRecord(item.error) as { message?: string } | undefined,
    };
  }
  if (item.type === 'dynamicToolCall') {
    return { type: 'dynamic_tool_call', id };
  }
  if (item.type === 'webSearch') {
    return {
      type: 'web_search',
      id,
      query: typeof item.query === 'string' ? item.query : undefined,
      action: asRecord(item.action) ?? undefined,
      result: item.results,
    };
  }
  if (item.type === 'fileChange') {
    return {
      type: 'file_change',
      id,
      changes: Array.isArray(item.changes)
        ? item.changes.flatMap(change => {
            const value = asRecord(change);
            const kind = asRecord(value?.kind)?.type;
            return typeof value?.path === 'string' &&
              (kind === 'add' || kind === 'delete' || kind === 'update')
              ? [{ path: value.path, kind }]
              : [];
          })
        : [],
    };
  }
  if (item.type === 'plan') return { type: 'todo_list', id };
  return undefined;
}

function normalizeCommandStatus(
  value: unknown,
): 'in_progress' | 'completed' | 'failed' {
  if (value === 'completed') return 'completed';
  if (value === 'inProgress') return 'in_progress';
  return 'failed';
}

function matchesActiveTurn({
  params,
  activeThreadId,
  activeTurnId,
}: {
  params: Record<string, unknown>;
  activeThreadId: string | undefined;
  activeTurnId: string | undefined;
}): boolean {
  const nestedTurn = asRecord(params.turn);
  const turnId =
    typeof params.turnId === 'string'
      ? params.turnId
      : typeof nestedTurn?.id === 'string'
        ? nestedTurn.id
        : undefined;
  return (
    activeThreadId != null &&
    activeTurnId != null &&
    params.threadId === activeThreadId &&
    turnId === activeTurnId
  );
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function emptyUsageBreakdown(): UsageBreakdown {
  return {
    inputTokens: 0,
    cachedInputTokens: 0,
    cacheWriteInputTokens: 0,
    outputTokens: 0,
  };
}

function readUsageBreakdown(value: unknown): UsageBreakdown | undefined {
  const usage = asRecord(value);
  if (usage == null) return undefined;
  return {
    inputTokens: numberOrZero(usage.inputTokens),
    cachedInputTokens: numberOrZero(usage.cachedInputTokens),
    cacheWriteInputTokens: numberOrZero(usage.cacheWriteInputTokens),
    outputTokens: numberOrZero(usage.outputTokens),
  };
}

function addUsage({
  total,
  increment,
}: {
  total: UsageBreakdown;
  increment: UsageBreakdown;
}): UsageBreakdown {
  return {
    inputTokens: total.inputTokens + increment.inputTokens,
    cachedInputTokens: total.cachedInputTokens + increment.cachedInputTokens,
    cacheWriteInputTokens:
      total.cacheWriteInputTokens + increment.cacheWriteInputTokens,
    outputTokens: total.outputTokens + increment.outputTokens,
  };
}

function usageKey(usage: UsageBreakdown): string {
  return [
    usage.inputTokens,
    usage.cachedInputTokens,
    usage.cacheWriteInputTokens,
    usage.outputTokens,
  ].join(':');
}

function toLegacyUsage(usage: UsageBreakdown): Record<string, number> {
  return {
    input_tokens: usage.inputTokens,
    cached_input_tokens: usage.cachedInputTokens,
    cache_write_input_tokens: usage.cacheWriteInputTokens,
    output_tokens: usage.outputTokens,
  };
}

function numberOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
