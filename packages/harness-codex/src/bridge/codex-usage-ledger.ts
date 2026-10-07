import type { CodexAppServerNotification } from './codex-app-server-client';

/*
 * Token accounting for a Codex session.
 *
 * Codex reports usage per thread through `thread/tokenUsage/updated`, as a
 * cumulative `total` plus the `last` model call. Sub-agents run as their own
 * threads: the parent's `total` excludes them, and they are announced only by
 * `collabAgentToolCall` items on the thread that started or addressed them.
 *
 * The ledger keeps two cumulative totals per thread: what the server has
 * `seen`, and what has been `billed`. A thread's increment is always
 * `seen - billed` per field, never negative, so a repeated or replayed
 * snapshot adds nothing and a skipped snapshot is recovered by the next one.
 * Usage that arrives while no turn is attached (between turns, or after an
 * abort) accumulates and is billed to the next turn instead of being lost.
 * The policy is to never over-bill: when a history cannot be told apart from
 * new usage, it is not billed.
 *
 * Only the session's own threads are billed: the active thread plus the threads
 * it spawned, at any depth. State lives as long as the app-server process.
 */

export type UsageBreakdown = {
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
};

type UsageSnapshot = { total: UsageBreakdown; last: UsageBreakdown };

/**
 * How the first snapshot of a billed thread is attributed:
 * - `new`: the thread was created by this session (a fresh thread or a spawned
 *   sub-agent), so everything it used is ours.
 * - `unknown`: the thread existed before we saw it (a resumed thread, or an
 *   existing sub-agent we are only now addressing). Its `total` includes
 *   history, so without a known baseline only the session's own thread is billed
 *   for its `last` call, and any other thread is merely baselined.
 */
type ThreadOrigin = 'new' | 'unknown';

type PendingSpawns = Map<string, ThreadOrigin>; // receiver -> origin

type ActiveTurn = {
  threadId: string;
  turnId: string | undefined;
  onChange: (turnUsage: UsageBreakdown) => void;
  onWarning: ((message: string) => void) | undefined;
};

// Bounds for threads on the connection that are not (yet) known to be ours.
const MAX_UNCLAIMED_THREADS = 1024;
const MAX_PENDING_SPAWN_SENDERS = 256;
const MAX_PENDING_SPAWNS_PER_SENDER = 256;

export type CodexUsageLedger = {
  /**
   * Attach a turn. `resumed` says whether the active thread existed before this
   * turn. Usage carried over from while no turn was attached is billed now.
   */
  begin(input: {
    threadId: string;
    resumed: boolean;
    /** Called with the turn's running total whenever it grows. */
    onChange: (turnUsage: UsageBreakdown) => void;
    onWarning?: (message: string) => void;
  }): void;
  setTurnId(turnId: string): void;
  /** Detach the turn. Later usage is held and billed to the next turn. */
  end(): void;
  /** Feed any app-server notification; irrelevant ones are ignored. */
  handleNotification(notification: CodexAppServerNotification): void;
  /** Usage billed to the current turn so far. */
  turnUsage(): UsageBreakdown;
  /**
   * Forget what describes the app-server process that is gone. Usage already
   * received but not yet billed to a turn is kept: it is real, and a new
   * process baselines the threads it resumes.
   */
  reset(): void;
};

export function createCodexUsageLedger(): CodexUsageLedger {
  const family = new Map<string, ThreadOrigin>();
  const seen = new Map<string, UsageSnapshot>();
  const billed = new Map<string, UsageBreakdown>();
  const pendingSpawns = new Map<string, PendingSpawns>();
  let primaryThreadId: string | undefined;
  let active: ActiveTurn | undefined;
  let turnTotal = emptyUsage();
  // Billed while no turn was attached; handed to the next turn.
  let carryOver = emptyUsage();

  // Bill whatever a family thread has used since it was last billed.
  const settle = (threadId: string): void => {
    const origin = family.get(threadId);
    const snapshot = seen.get(threadId);
    if (origin == null || snapshot == null) return;

    const previous = billed.get(threadId);
    const increment =
      previous == null
        ? origin === 'new'
          ? snapshot.total
          : // History we cannot tell apart from new usage is not billed,
            // except the last call of the thread this session is running.
            threadId === primaryThreadId
            ? snapshot.last
            : emptyUsage()
        : // Per field and never negative: a replayed or reset total is not
          // billed again.
          difference(snapshot.total, previous);
    billed.set(
      threadId,
      previous == null ? snapshot.total : maxUsage(previous, snapshot.total),
    );
    if (isEmpty(increment)) return;

    if (active == null) {
      carryOver = add(carryOver, increment);
      return;
    }
    turnTotal = add(turnTotal, increment);
    active.onChange(turnTotal);
  };

  // Make a thread part of the session, replaying what we already know of it.
  const adopt = (threadId: string, origin: ThreadOrigin): void => {
    if (family.has(threadId)) {
      // A spawn announcement proves a thread new, if nothing was billed for it
      // yet on the assumption that it was not.
      if (
        origin === 'new' &&
        family.get(threadId) === 'unknown' &&
        !billed.has(threadId)
      ) {
        family.set(threadId, 'new');
        settle(threadId);
      }
      return;
    }
    family.set(threadId, origin);
    settle(threadId);
    const queued = pendingSpawns.get(threadId);
    if (queued == null) return;
    pendingSpawns.delete(threadId);
    for (const [receiverThreadId, receiverOrigin] of queued) {
      adopt(receiverThreadId, receiverOrigin);
    }
  };

  const rememberSnapshot = (
    threadId: string,
    snapshot: UsageSnapshot,
  ): void => {
    // Re-insert so the oldest entry is always the least recently updated.
    seen.delete(threadId);
    seen.set(threadId, snapshot);
    if (seen.size <= MAX_UNCLAIMED_THREADS) return;
    for (const candidate of seen.keys()) {
      if (family.has(candidate)) continue;
      seen.delete(candidate);
      active?.onWarning?.(
        'Dropped token usage tracking for an unrelated Codex thread (too many threads on the connection).',
      );
      return;
    }
  };

  const observeUsage = (params: Record<string, unknown>): void => {
    const threadId = params.threadId;
    if (typeof threadId !== 'string') return;
    const tokenUsage = asRecord(params.tokenUsage);
    const total = readUsageBreakdown(tokenUsage?.total);
    const last = readUsageBreakdown(tokenUsage?.last);
    if (total == null || last == null) return;
    const snapshot: UsageSnapshot = { total, last };

    // On the active thread, a snapshot that is not from this turn and arrives
    // before anything was billed for a resumed thread is the replay of its
    // history (Codex replays the latest snapshot when a thread is resumed): a
    // baseline, not new usage. Before the turn id is known only a thread we
    // created can be reporting current usage.
    if (active?.threadId === threadId) {
      const isCurrent =
        active.turnId != null
          ? params.turnId === active.turnId
          : family.get(threadId) === 'new';
      if (
        !isCurrent &&
        !billed.has(threadId) &&
        family.get(threadId) !== 'new'
      ) {
        billed.set(threadId, total);
        return;
      }
    }

    rememberSnapshot(threadId, snapshot);
    settle(threadId);
  };

  const observeAnnouncement = (params: Record<string, unknown>): void => {
    const item = asRecord(params.item);
    if (item?.type !== 'collabAgentToolCall') return;
    // Trust where the notification came from, not who the item claims sent it.
    const sender = params.threadId;
    if (typeof sender !== 'string') return;
    // An announcement on the active thread must belong to the current turn
    // (Codex runs turns serially, so a late one from an earlier turn is stale).
    if (
      active?.threadId === sender &&
      active.turnId != null &&
      params.turnId !== active.turnId
    ) {
      return;
    }

    const receivers = readStringArray(item.receiverThreadIds);
    const origin: ThreadOrigin = item.tool === 'spawnAgent' ? 'new' : 'unknown';
    for (const receiverThreadId of receivers) {
      if (family.has(sender)) {
        adopt(receiverThreadId, origin);
        continue;
      }
      // The sender is not ours yet; it may become ours (e.g. a grandchild
      // announced before its parent), so remember the announcement.
      const queued: PendingSpawns = pendingSpawns.get(sender) ?? new Map();
      if (
        queued.size < MAX_PENDING_SPAWNS_PER_SENDER ||
        queued.has(receiverThreadId)
      ) {
        // A spawn is the stronger statement about a thread's origin.
        if (queued.get(receiverThreadId) !== 'new') {
          queued.set(receiverThreadId, origin);
        }
      }
      pendingSpawns.set(sender, queued);
      if (pendingSpawns.size > MAX_PENDING_SPAWN_SENDERS) {
        const oldest = pendingSpawns.keys().next().value;
        if (oldest != null) pendingSpawns.delete(oldest);
      }
    }
  };

  return {
    begin({ threadId, resumed, onChange, onWarning }) {
      primaryThreadId = threadId;
      active = { threadId, turnId: undefined, onChange, onWarning };
      turnTotal = carryOver;
      carryOver = emptyUsage();
      // Whatever a thread we did not create had used before this turn is not ours.
      const preTurn = seen.get(threadId);
      if (resumed && preTurn != null && !billed.has(threadId)) {
        billed.set(threadId, preTurn.total);
      }
      adopt(threadId, resumed ? 'unknown' : 'new');
      for (const familyThreadId of family.keys()) settle(familyThreadId);
      if (!isEmpty(turnTotal)) onChange(turnTotal);
    },
    setTurnId(turnId) {
      if (active != null) active.turnId = turnId;
    },
    end() {
      active = undefined;
    },
    handleNotification(notification) {
      const params = asRecord(notification.params);
      if (params == null) return;
      if (notification.method === 'thread/tokenUsage/updated') {
        observeUsage(params);
      } else if (
        notification.method === 'item/started' ||
        notification.method === 'item/completed'
      ) {
        observeAnnouncement(params);
      }
    },
    turnUsage: () => turnTotal,
    reset() {
      family.clear();
      seen.clear();
      billed.clear();
      pendingSpawns.clear();
      primaryThreadId = undefined;
      active = undefined;
      turnTotal = emptyUsage();
    },
  };
}

export function emptyUsage(): UsageBreakdown {
  return {
    inputTokens: 0,
    cachedInputTokens: 0,
    cacheWriteInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
  };
}

/** Snake-case shape carried on the bridge's `turn.completed` / `usage.updated`. */
export function toLegacyUsage(usage: UsageBreakdown): Record<string, number> {
  return {
    input_tokens: usage.inputTokens,
    cached_input_tokens: usage.cachedInputTokens,
    cache_write_input_tokens: usage.cacheWriteInputTokens,
    output_tokens: usage.outputTokens,
    reasoning_output_tokens: usage.reasoningOutputTokens,
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
    reasoningOutputTokens: numberOrZero(usage.reasoningOutputTokens),
  };
}

const USAGE_FIELDS = [
  'inputTokens',
  'cachedInputTokens',
  'cacheWriteInputTokens',
  'outputTokens',
  'reasoningOutputTokens',
] as const satisfies ReadonlyArray<keyof UsageBreakdown>;

function mapFields(
  a: UsageBreakdown,
  b: UsageBreakdown,
  fn: (x: number, y: number) => number,
): UsageBreakdown {
  const result = emptyUsage();
  for (const field of USAGE_FIELDS) result[field] = fn(a[field], b[field]);
  return result;
}

const add = (a: UsageBreakdown, b: UsageBreakdown) =>
  mapFields(a, b, (x, y) => x + y);

const difference = (current: UsageBreakdown, previous: UsageBreakdown) =>
  mapFields(current, previous, (x, y) => Math.max(0, x - y));

const maxUsage = (a: UsageBreakdown, b: UsageBreakdown) =>
  mapFields(a, b, Math.max);

const isEmpty = (usage: UsageBreakdown) =>
  USAGE_FIELDS.every(field => usage[field] === 0);

function numberOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : 0;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
