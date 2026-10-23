import type { CodexAppServerNotification } from './codex-app-server-client';

// Items about subagents. Multi-agent v2 announces a subagent with
// subAgentActivity (agentThreadId); v1 with collabAgentToolCall
// (receiverThreadIds). Either can appear on a subagent's thread when it nests.
const SUBAGENT_ACTIVITY_ITEM_TYPES = new Set([
  'subAgentActivity',
  'collabAgentToolCall',
]);

// Notifications on a subagent's own thread that are forwarded. Command output
// and reasoning deltas stay out: the completed item carries the full content.
const FORWARDED_SUBAGENT_THREAD_METHODS = new Set([
  'item/started',
  'item/completed',
  'item/agentMessage/delta',
  'turn/started',
  'turn/completed',
  'thread/tokenUsage/updated',
  'thread/status/changed',
]);

// Per thread, how many notifications are held while waiting; later ones are
// dropped.
const MAX_HELD_SUBAGENT_NOTIFICATIONS_PER_THREAD = 200;

export type SubagentActivityForwarder = ReturnType<
  typeof createSubagentActivityForwarder
>;

/**
 * Forwards Codex subagent activity on one main thread as raw stream parts and
 * remembers its subagent threads across responses. Create one per main thread
 * loaded in an app-server process.
 */
export function createSubagentActivityForwarder({
  mainThreadId,
}: {
  mainThreadId: string;
}): {
  /**
   * Returns true when the notification is subagent activity. It is then
   * forwarded or held, and must not reach the main turn.
   */
  forwardIfSubagentActivity(notification: CodexAppServerNotification): boolean;
  /** Forwards what was held between responses, then everything after it. */
  startForwardingToResponse(input: {
    emitRawPart: (rawValue: CodexAppServerNotification) => void;
  }): void;
  /** Holds subagent activity for the next response from now on. */
  stopForwardingToResponse(): void;
} {
  const subagentThreadIds = new Set<string>();
  // Threads not announced yet: held during a response, dropped when it ends.
  const heldUntilThreadAnnounced = new Map<
    string,
    CodexAppServerNotification[]
  >();
  // Subagent activity that arrived while no response was streaming, in order.
  const heldForNextResponse: CodexAppServerNotification[] = [];
  const heldForNextResponseCountByThread = new Map<string, number>();
  let emitRawPart: ((rawValue: CodexAppServerNotification) => void) | undefined;

  const rememberSubagentThreadsAnnouncedBy = (
    item: Record<string, unknown> | undefined,
  ): string[] => {
    const announced =
      item?.type === 'subAgentActivity' &&
      (item.kind === 'started' || item.kind === 'interacted')
        ? [item.agentThreadId]
        : item?.type === 'collabAgentToolCall' &&
            Array.isArray(item.receiverThreadIds)
          ? item.receiverThreadIds
          : [];
    const newThreadIds: string[] = [];
    for (const threadId of announced) {
      if (
        typeof threadId !== 'string' ||
        threadId === mainThreadId ||
        subagentThreadIds.has(threadId)
      ) {
        continue;
      }
      subagentThreadIds.add(threadId);
      newThreadIds.push(threadId);
    }
    return newThreadIds;
  };

  const forwardOrHoldForNextResponse = ({
    notification,
    threadId,
    item,
  }: {
    notification: CodexAppServerNotification;
    threadId: string;
    item: Record<string, unknown> | undefined;
  }): void => {
    const newThreadIds = rememberSubagentThreadsAnnouncedBy(item);
    if (emitRawPart == null) {
      const count = heldForNextResponseCountByThread.get(threadId) ?? 0;
      if (count >= MAX_HELD_SUBAGENT_NOTIFICATIONS_PER_THREAD) return;
      heldForNextResponseCountByThread.set(threadId, count + 1);
      heldForNextResponse.push(notification);
      return;
    }
    emitRawPart(notification);
    // A newly announced thread's earlier notifications follow its announcement,
    // and can announce nested subagents themselves.
    for (const newThreadId of newThreadIds) {
      const held = heldUntilThreadAnnounced.get(newThreadId) ?? [];
      heldUntilThreadAnnounced.delete(newThreadId);
      for (const heldNotification of held) {
        forwardOrHoldForNextResponse({
          notification: heldNotification,
          threadId: newThreadId,
          item: findSubagentActivityItem(heldNotification),
        });
      }
    }
  };

  return {
    forwardIfSubagentActivity(notification) {
      const threadId = asRecord(notification.params)?.threadId;
      if (typeof threadId !== 'string') return false;
      const subagentActivityItem = findSubagentActivityItem(notification);
      if (threadId === mainThreadId) {
        // Forwarded whatever its turn: a subagent can outlive the response
        // that started it.
        if (subagentActivityItem == null) return false;
        forwardOrHoldForNextResponse({
          notification,
          threadId,
          item: subagentActivityItem,
        });
        return true;
      }
      if (!FORWARDED_SUBAGENT_THREAD_METHODS.has(notification.method)) {
        return false;
      }
      if (subagentThreadIds.has(threadId)) {
        forwardOrHoldForNextResponse({
          notification,
          threadId,
          item: subagentActivityItem,
        });
        return true;
      }
      // Not announced yet: Codex can send a subagent's first notifications
      // before the item that names its thread.
      if (emitRawPart == null) return false;
      const held = heldUntilThreadAnnounced.get(threadId) ?? [];
      if (held.length < MAX_HELD_SUBAGENT_NOTIFICATIONS_PER_THREAD) {
        held.push(notification);
        heldUntilThreadAnnounced.set(threadId, held);
      }
      return true;
    },
    startForwardingToResponse(input) {
      emitRawPart = input.emitRawPart;
      const held = heldForNextResponse.splice(0);
      heldForNextResponseCountByThread.clear();
      for (const notification of held) emitRawPart(notification);
    },
    stopForwardingToResponse() {
      emitRawPart = undefined;
      heldUntilThreadAnnounced.clear();
    },
  };
}

function findSubagentActivityItem(
  notification: CodexAppServerNotification,
): Record<string, unknown> | undefined {
  if (
    notification.method !== 'item/started' &&
    notification.method !== 'item/completed'
  ) {
    return undefined;
  }
  const item = asRecord(asRecord(notification.params)?.item);
  return typeof item?.type === 'string' &&
    SUBAGENT_ACTIVITY_ITEM_TYPES.has(item.type)
    ? item
    : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
