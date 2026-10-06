import type { BridgeTurn } from '@ai-sdk/harness/bridge';
import type { CodexStepTracker } from './codex-step-tracker';
import type { CodexEvent, CodexItem } from './create-emit-stream-event';
import type { CodexAppServerNotification } from './codex-app-server-client';
import {
  createCodexUsageLedger,
  toLegacyUsage,
  type CodexUsageLedger,
} from './codex-usage-ledger';

export type AppServerTurnResult = {
  status: string;
  error?: string;
};

type NativeToolName = 'apply_patch' | 'view_image';

type NativeToolCall = {
  name: NativeToolName;
  resultEmitted: boolean;
  successConfirmed: boolean;
};

export function createAppServerEventHandler({
  stepTracker,
  emitStreamEvent,
  emitWarning,
  emitError,
  usageLedger = createCodexUsageLedger(),
}: {
  stepTracker: CodexStepTracker;
  emitStreamEvent: (event: CodexEvent) => void;
  emitWarning: BridgeTurn['emitWarning'];
  emitError: BridgeTurn['emitError'];
  /** Token accounting; shared across turns so sub-agent state survives them. */
  usageLedger?: CodexUsageLedger;
}): {
  announceThread(threadId: string, options?: { resumed?: boolean }): void;
  handle(notification: CodexAppServerNotification): void;
  setTurnId(turnId: string): void;
  waitForCompletion(): Promise<AppServerTurnResult>;
} {
  let activeThreadId: string | undefined;
  let activeTurnId: string | undefined;
  let settled = false;
  const textByItem = new Map<string, string>();
  const reasoningByItem = new Map<string, string>();
  const nativeToolCalls = new Map<string, NativeToolCall>();
  let resolveCompletion: (result: AppServerTurnResult) => void = () => {};
  const completion = new Promise<AppServerTurnResult>(resolve => {
    resolveCompletion = resolve;
  });
  const announceThread = (
    threadId: string,
    options?: { resumed?: boolean },
  ): void => {
    if (activeThreadId != null) return;
    activeThreadId = threadId;
    usageLedger.begin({
      threadId,
      // A thread announced by `thread/started` is always new.
      resumed: options?.resumed ?? false,
      // Report as it happens so an aborted or failed turn keeps its usage.
      onChange: usage =>
        emitStreamEvent({ type: 'usage.updated', usage: toLegacyUsage(usage) }),
      onWarning: message => emitWarning({ message }),
    });
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
    if (eventType === 'item.completed' && typeof item.id === 'string') {
      const call = nativeToolCalls.get(item.id);
      if (call?.name === 'apply_patch' && item.type === 'fileChange') {
        call.successConfirmed = item.status === 'completed';
      } else if (call?.name === 'view_image' && item.type === 'imageView') {
        call.successConfirmed = true;
      }
    }
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

  const emitNativeToolResult = ({
    callId,
    result,
  }: {
    callId: string;
    result: unknown;
  }): void => {
    const call = nativeToolCalls.get(callId);
    if (call == null || call.resultEmitted) return;
    call.resultEmitted = true;
    emitStreamEvent({
      type: 'item.completed',
      item: {
        type: 'native_tool',
        id: callId,
        tool: call.name,
        result,
        ...(!call.successConfirmed ? { isError: true } : {}),
      },
    });
  };

  const handleRawItem = (params: Record<string, unknown>): void => {
    if (!matchesActiveTurn({ params, activeThreadId, activeTurnId })) return;
    const item = asRecord(params.item);
    if (item == null) return;
    const toolCall = normalizeNativeToolCall({ item });
    if (toolCall != null) {
      if (nativeToolCalls.has(toolCall.callId)) return;
      nativeToolCalls.set(toolCall.callId, {
        name: toolCall.name,
        resultEmitted: false,
        successConfirmed: false,
      });
      emitStreamEvent({
        type: 'item.started',
        item: {
          type: 'native_tool',
          id: toolCall.callId,
          tool: toolCall.name,
          input: toolCall.input,
        },
      });
      return;
    }
    if (typeof item.call_id !== 'string') return;
    const call = nativeToolCalls.get(item.call_id);
    if (
      call == null ||
      (call.name === 'apply_patch'
        ? item.type !== 'custom_tool_call_output'
        : item.type !== 'function_call_output') ||
      !Object.prototype.hasOwnProperty.call(item, 'output')
    ) {
      return;
    }
    emitNativeToolResult({
      callId: item.call_id,
      result:
        call.name === 'view_image' &&
        call.successConfirmed &&
        Array.isArray(item.output) &&
        item.output.length === 0
          ? 'Image viewed.'
          : item.output,
    });
  };

  return {
    announceThread,
    setTurnId(turnId) {
      activeTurnId = turnId;
      usageLedger.setTurnId(turnId);
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
          usageLedger.setTurnId(turn.id);
        }
        return;
      }
      // Usage and sub-agent announcements are accounted for by the ledger,
      // across every thread on the connection, not just the active turn.
      usageLedger.handleNotification(notification);
      if (notification.method === 'item/started' && params != null) {
        handleItem({ eventType: 'item.started', params });
        return;
      }
      if (notification.method === 'item/completed' && params != null) {
        handleItem({ eventType: 'item.completed', params });
        return;
      }
      if (
        notification.method === 'rawResponseItem/completed' &&
        params != null
      ) {
        handleRawItem(params);
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
      if (notification.method === 'thread/tokenUsage/updated') return;
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
          // Flush the open step first so its usage is not lost with the error.
          stepTracker.finishTurn();
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
        if (status === 'completed') {
          for (const [callId, call] of nativeToolCalls) {
            if (call.resultEmitted) continue;
            emitNativeToolResult({
              callId,
              result: call.successConfirmed
                ? call.name === 'apply_patch'
                  ? 'Patch applied.'
                  : 'Image viewed.'
                : 'Codex did not report the tool result.',
            });
          }
        }
        emitStreamEvent({
          type: 'turn.completed',
          usage: toLegacyUsage(usageLedger.turnUsage()),
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

function normalizeNativeToolCall({
  item,
}: {
  item: Record<string, unknown>;
}): { callId: string; name: NativeToolName; input: string } | undefined {
  if (
    item.namespace != null ||
    typeof item.call_id !== 'string' ||
    item.call_id.length === 0
  ) {
    return undefined;
  }
  if (
    item.type === 'custom_tool_call' &&
    item.name === 'apply_patch' &&
    typeof item.input === 'string'
  ) {
    return {
      callId: item.call_id,
      name: 'apply_patch',
      input: JSON.stringify(item.input),
    };
  }
  if (
    item.type === 'function_call' &&
    item.name === 'view_image' &&
    typeof item.arguments === 'string'
  ) {
    return {
      callId: item.call_id,
      name: 'view_image',
      input: item.arguments,
    };
  }
  return undefined;
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
