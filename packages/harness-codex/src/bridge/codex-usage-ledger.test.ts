import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { CodexAppServerNotification } from './codex-app-server-client';
import {
  createCodexUsageLedger,
  type CodexUsageLedger,
  type UsageBreakdown,
} from './codex-usage-ledger';

type Counts = { input: number; output: number };

const breakdown = ({ input, output }: Counts) => ({
  totalTokens: input + output,
  inputTokens: input,
  cachedInputTokens: 0,
  cacheWriteInputTokens: 0,
  outputTokens: output,
  reasoningOutputTokens: 0,
});

const usageNotification = ({
  threadId,
  turnId,
  total,
  last = total,
}: {
  threadId: string;
  turnId: string;
  total: Counts;
  last?: Counts;
}): CodexAppServerNotification => ({
  method: 'thread/tokenUsage/updated',
  params: {
    threadId,
    turnId,
    tokenUsage: { total: breakdown(total), last: breakdown(last) },
  },
});

const collabNotification = ({
  sender,
  receivers,
  tool = 'spawnAgent',
  turnId = `${sender}-turn`,
}: {
  sender: string;
  receivers: string[];
  tool?: string;
  turnId?: string;
}): CodexAppServerNotification => ({
  method: 'item/completed',
  params: {
    threadId: sender,
    turnId,
    item: {
      type: 'collabAgentToolCall',
      id: `${tool}-${receivers.join(',')}`,
      tool,
      senderThreadId: sender,
      receiverThreadIds: receivers,
    },
  },
});

const counts = (usage: UsageBreakdown): Counts => ({
  input: usage.inputTokens,
  output: usage.outputTokens,
});

/** One ledger shared across turns, like the app-server runtime does. */
function createSession() {
  const ledger = createCodexUsageLedger();
  const warnings: string[] = [];
  const changes: Counts[] = [];
  return {
    ledger,
    warnings,
    changes,
    begin(
      threadId: string,
      { resumed = false, turnId = `${threadId}-turn` } = {},
    ) {
      changes.length = 0;
      ledger.begin({
        threadId,
        resumed,
        onChange: usage => changes.push(counts(usage)),
        onWarning: message => warnings.push(message),
      });
      ledger.setTurnId(turnId);
    },
    feed: (...notifications: CodexAppServerNotification[]) => {
      for (const notification of notifications) {
        ledger.handleNotification(notification);
      }
    },
    total: () => counts(ledger.turnUsage()),
  };
}

describe('CodexUsageLedger', () => {
  describe('the active thread', () => {
    it('bills a new thread by its total, even when the first snapshot is large', () => {
      const s = createSession();
      s.begin('p');
      s.feed(
        usageNotification({
          threadId: 'p',
          turnId: 'p-turn',
          total: { input: 300, output: 30 },
          last: { input: 100, output: 10 },
        }),
      );
      expect(s.total()).toEqual({ input: 300, output: 30 });
    });

    it('ignores a repeated snapshot and recovers a skipped one', () => {
      const s = createSession();
      s.begin('p');
      const at = (input: number, output: number, last?: Counts) =>
        usageNotification({
          threadId: 'p',
          turnId: 'p-turn',
          total: { input, output },
          ...(last ? { last } : {}),
        });
      s.feed(at(100, 10), at(100, 10));
      expect(s.changes).toEqual([{ input: 100, output: 10 }]);
      // The snapshot between 100 and 300 never arrived.
      s.feed(at(300, 30, { input: 50, output: 5 }));
      expect(s.total()).toEqual({ input: 300, output: 30 });
    });

    it('bills a resumed thread only for this turn when the pre-turn snapshot is known', () => {
      const s = createSession();
      // Codex replays the latest snapshot when the thread is resumed.
      s.feed(
        usageNotification({
          threadId: 'p',
          turnId: 'old-turn',
          total: { input: 1000, output: 100 },
        }),
      );
      s.begin('p', { resumed: true, turnId: 'new-turn' });
      s.feed(
        usageNotification({
          threadId: 'p',
          turnId: 'new-turn',
          total: { input: 1250, output: 120 },
          last: { input: 40, output: 4 },
        }),
      );
      expect(s.total()).toEqual({ input: 250, output: 20 });
    });

    it('treats a replay that arrives after the turn started as a baseline', () => {
      const s = createSession();
      s.begin('p', { resumed: true, turnId: 'new-turn' });
      s.feed(
        usageNotification({
          threadId: 'p',
          turnId: 'old-turn',
          total: { input: 1000, output: 100 },
        }),
        usageNotification({
          threadId: 'p',
          turnId: 'new-turn',
          total: { input: 1100, output: 105 },
        }),
      );
      expect(s.total()).toEqual({ input: 100, output: 5 });
    });

    it('never over-bills a resumed thread with no baseline: only the last call', () => {
      const s = createSession();
      s.begin('p', { resumed: true });
      s.feed(
        usageNotification({
          threadId: 'p',
          turnId: 'p-turn',
          total: { input: 5000, output: 500 },
          last: { input: 80, output: 8 },
        }),
      );
      expect(s.total()).toEqual({ input: 80, output: 8 });
    });

    it('bills a late increase from a previous turn but never a replayed total', () => {
      const s = createSession();
      s.begin('p');
      s.feed(
        usageNotification({
          threadId: 'p',
          turnId: 'p-turn',
          total: { input: 100, output: 10 },
        }),
        // The same snapshot replayed under an old turn id adds nothing.
        usageNotification({
          threadId: 'p',
          turnId: 'old-turn',
          total: { input: 100, output: 10 },
        }),
      );
      expect(s.total()).toEqual({ input: 100, output: 10 });
      // A real increase reported under a previous turn id is still our usage.
      s.feed(
        usageNotification({
          threadId: 'p',
          turnId: 'old-turn',
          total: { input: 130, output: 13 },
        }),
      );
      expect(s.total()).toEqual({ input: 130, output: 13 });
    });

    it('never bills a total that went down, nor re-bills it when it comes back up', () => {
      const s = createSession();
      s.begin('p');
      const at = (input: number) =>
        usageNotification({
          threadId: 'p',
          turnId: 'p-turn',
          total: { input, output: 0 },
        });
      // 100, a replayed older 20, the real 200 again, then 230.
      s.feed(at(100), at(20), at(200), at(200), at(230));
      expect(s.total()).toEqual({ input: 230, output: 0 });
    });

    it('carries reasoning tokens through', () => {
      const s = createSession();
      s.begin('p');
      s.feed({
        method: 'thread/tokenUsage/updated',
        params: {
          threadId: 'p',
          turnId: 'p-turn',
          tokenUsage: {
            total: {
              ...breakdown({ input: 10, output: 8 }),
              reasoningOutputTokens: 5,
            },
            last: {
              ...breakdown({ input: 10, output: 8 }),
              reasoningOutputTokens: 5,
            },
          },
        },
      });
      expect(s.ledger.turnUsage().reasoningOutputTokens).toBe(5);
    });
  });

  describe('sub-agents', () => {
    it('bills a spawned child by its full total once announced', () => {
      const s = createSession();
      s.begin('p');
      s.feed(
        collabNotification({ sender: 'p', receivers: ['c'] }),
        usageNotification({
          threadId: 'c',
          turnId: 'c-turn',
          total: { input: 40, output: 4 },
          last: { input: 15, output: 1 },
        }),
      );
      expect(s.total()).toEqual({ input: 40, output: 4 });
    });

    it('holds usage reported before the spawn is announced, then bills it', () => {
      const s = createSession();
      s.begin('p');
      s.feed(
        usageNotification({
          threadId: 'c',
          turnId: 'c-turn',
          total: { input: 40, output: 4 },
        }),
        usageNotification({
          threadId: 'c',
          turnId: 'c-turn',
          total: { input: 90, output: 9 },
        }),
      );
      expect(s.total()).toEqual({ input: 0, output: 0 });
      s.feed(collabNotification({ sender: 'p', receivers: ['c'] }));
      expect(s.total()).toEqual({ input: 90, output: 9 });
    });

    it('does not lose a child to the held-usage bound however many snapshots it sent first', () => {
      const s = createSession();
      s.begin('p');
      for (let i = 1; i <= 500; i++) {
        s.feed(
          usageNotification({
            threadId: 'c',
            turnId: 'c-turn',
            total: { input: i * 10, output: i },
            last: { input: 10, output: 1 },
          }),
        );
      }
      s.feed(collabNotification({ sender: 'p', receivers: ['c'] }));
      expect(s.total()).toEqual({ input: 5000, output: 500 });
    });

    it('counts a grandchild announced before its parent is known to be ours', () => {
      const s = createSession();
      s.begin('p');
      s.feed(
        // The child announces a grandchild before the parent announced the child.
        collabNotification({ sender: 'child', receivers: ['grandchild'] }),
        usageNotification({
          threadId: 'grandchild',
          turnId: 'g',
          total: { input: 7, output: 1 },
        }),
        usageNotification({
          threadId: 'child',
          turnId: 'c',
          total: { input: 20, output: 2 },
        }),
      );
      expect(s.total()).toEqual({ input: 0, output: 0 });
      s.feed(collabNotification({ sender: 'p', receivers: ['child'] }));
      expect(s.total()).toEqual({ input: 27, output: 3 });
    });

    it('never counts a thread nobody in the session announced', () => {
      const s = createSession();
      s.begin('p');
      s.feed(
        usageNotification({
          threadId: 'stranger',
          turnId: 's',
          total: { input: 500, output: 50 },
        }),
        // A stranger announcing itself or others does not make them ours.
        collabNotification({ sender: 'stranger', receivers: ['other'] }),
        usageNotification({
          threadId: 'other',
          turnId: 'o',
          total: { input: 70, output: 7 },
        }),
      );
      expect(s.total()).toEqual({ input: 0, output: 0 });
    });

    it('ignores an announcement from an earlier turn of the active thread', () => {
      const s = createSession();
      s.begin('p', { turnId: 'turn-2' });
      s.feed(
        collabNotification({
          sender: 'p',
          receivers: ['old-child'],
          turnId: 'turn-1',
        }),
        usageNotification({
          threadId: 'old-child',
          turnId: 'x',
          total: { input: 50, output: 5 },
        }),
      );
      expect(s.total()).toEqual({ input: 0, output: 0 });
    });

    it('accepts an announcement before the turn id is known', () => {
      const s = createSession();
      s.ledger.begin({ threadId: 'p', resumed: false, onChange: () => {} });
      s.feed(
        collabNotification({ sender: 'p', receivers: ['c'] }),
        usageNotification({
          threadId: 'c',
          turnId: 'c-turn',
          total: { input: 30, output: 3 },
        }),
      );
      expect(counts(s.ledger.turnUsage())).toEqual({ input: 30, output: 3 });
    });

    it('only baselines an existing child addressed by wait, then bills what it uses', () => {
      const s = createSession();
      s.begin('p');
      s.feed(
        collabNotification({
          sender: 'p',
          receivers: ['old-child'],
          tool: 'wait',
        }),
        usageNotification({
          threadId: 'old-child',
          turnId: 'x',
          total: { input: 9000, output: 900 },
          last: { input: 60, output: 6 },
        }),
      );
      // Its history cannot be told apart from new usage, so it is not billed.
      expect(s.total()).toEqual({ input: 0, output: 0 });
      s.feed(
        usageNotification({
          threadId: 'old-child',
          turnId: 'x',
          total: { input: 9100, output: 905 },
        }),
      );
      expect(s.total()).toEqual({ input: 100, output: 5 });
    });
  });

  describe('across turns', () => {
    it('keeps a child baseline so a later turn bills only the new usage', () => {
      const s = createSession();
      s.begin('p', { turnId: 't1' });
      s.feed(
        usageNotification({
          threadId: 'p',
          turnId: 't1',
          total: { input: 100, output: 10 },
        }),
        collabNotification({ sender: 'p', receivers: ['c'], turnId: 't1' }),
        usageNotification({
          threadId: 'c',
          turnId: 'c1',
          total: { input: 40, output: 4 },
        }),
      );
      expect(s.total()).toEqual({ input: 140, output: 14 });
      s.ledger.end();

      s.begin('p', { resumed: true, turnId: 't2' });
      s.feed(
        collabNotification({
          sender: 'p',
          receivers: ['c'],
          tool: 'sendInput',
          turnId: 't2',
        }),
        usageNotification({
          threadId: 'c',
          turnId: 'c2',
          total: { input: 55, output: 5 },
          last: { input: 15, output: 1 },
        }),
        usageNotification({
          threadId: 'p',
          turnId: 't2',
          total: { input: 130, output: 13 },
          last: { input: 30, output: 3 },
        }),
      );
      expect(s.total()).toEqual({ input: 45, output: 4 });
    });

    it('carries usage that arrives between turns into the next turn', () => {
      const s = createSession();
      s.begin('p', { turnId: 't1' });
      s.feed(
        collabNotification({ sender: 'p', receivers: ['c'], turnId: 't1' }),
        usageNotification({
          threadId: 'c',
          turnId: 'c1',
          total: { input: 40, output: 4 },
        }),
      );
      s.ledger.end();
      // The parent's turn is over but the child keeps working.
      s.feed(
        usageNotification({
          threadId: 'c',
          turnId: 'c1',
          total: { input: 100, output: 10 },
        }),
      );

      s.begin('p', { resumed: true, turnId: 't2' });
      expect(s.total()).toEqual({ input: 60, output: 6 });
    });

    it('holds usage reported after an abort for the next turn', () => {
      const s = createSession();
      s.begin('p');
      s.feed(
        usageNotification({
          threadId: 'p',
          turnId: 'p-turn',
          total: { input: 100, output: 10 },
        }),
      );
      s.ledger.end(); // the host stopped listening
      const emitted = s.changes.length;
      s.feed(
        usageNotification({
          threadId: 'p',
          turnId: 'p-turn',
          total: { input: 160, output: 16 },
        }),
      );
      expect(s.changes).toHaveLength(emitted);

      s.begin('p', { resumed: true, turnId: 'next-turn' });
      expect(s.total()).toEqual({ input: 60, output: 6 });
    });

    it('starts from nothing after reset (the app-server process is gone)', () => {
      const s = createSession();
      s.begin('p');
      s.feed(
        usageNotification({
          threadId: 'p',
          turnId: 'p-turn',
          total: { input: 100, output: 10 },
        }),
      );
      s.ledger.reset();
      expect(s.total()).toEqual({ input: 0, output: 0 });
    });
  });

  describe('review regressions', () => {
    it('bills a fresh thread whose first snapshot arrives after its turn ended', () => {
      const s = createSession();
      s.begin('p', { turnId: 't1' });
      s.ledger.end(); // the turn finished before Codex reported anything
      s.feed(
        usageNotification({
          threadId: 'p',
          turnId: 't1',
          total: { input: 100, output: 10 },
        }),
      );
      s.begin('p', { resumed: true, turnId: 't2' });
      expect(s.total()).toEqual({ input: 100, output: 10 });
    });

    it('bills a late previous-turn increase that arrives after the next turn began', () => {
      const s = createSession();
      s.begin('p', { turnId: 't1' });
      s.feed(
        usageNotification({
          threadId: 'p',
          turnId: 't1',
          total: { input: 100, output: 10 },
        }),
      );
      s.ledger.end();
      s.begin('p', { resumed: true, turnId: 't2' });
      s.feed(
        usageNotification({
          threadId: 'p',
          turnId: 't1',
          total: { input: 140, output: 14 },
        }),
      );
      expect(s.total()).toEqual({ input: 40, output: 4 });
    });

    it('accumulates everything reported while detached, however it moved', () => {
      const s = createSession();
      s.begin('p');
      s.feed(
        collabNotification({ sender: 'p', receivers: ['c'] }),
        usageNotification({
          threadId: 'c',
          turnId: 'c1',
          total: { input: 100, output: 10 },
        }),
      );
      s.ledger.end();
      const at = (input: number) =>
        usageNotification({
          threadId: 'c',
          turnId: 'c1',
          total: { input, output: 0 },
        });
      s.feed(at(150), at(80), at(190), at(190));
      s.begin('p', { resumed: true, turnId: 't2' });
      expect(s.total()).toEqual({ input: 90, output: 0 });
    });

    it('treats a child as new when its spawn is announced after a wait on it', () => {
      const s = createSession();
      s.begin('p');
      s.feed(
        collabNotification({ sender: 'p', receivers: ['c'], tool: 'wait' }),
        collabNotification({
          sender: 'p',
          receivers: ['c'],
          tool: 'spawnAgent',
        }),
        usageNotification({
          threadId: 'c',
          turnId: 'c1',
          total: { input: 300, output: 30 },
          last: { input: 100, output: 10 },
        }),
      );
      expect(s.total()).toEqual({ input: 300, output: 30 });
    });

    it('adopts every queued descendant, announced repeatedly', () => {
      const s = createSession();
      s.begin('p');
      const grandchildren = Array.from({ length: 80 }, (_, i) => `g${i}`);
      for (const id of grandchildren) {
        s.feed(
          // started and completed announce the same receiver twice
          collabNotification({ sender: 'child', receivers: [id] }),
          collabNotification({ sender: 'child', receivers: [id] }),
          usageNotification({
            threadId: id,
            turnId: id,
            total: { input: 10, output: 1 },
          }),
        );
      }
      s.feed(collabNotification({ sender: 'p', receivers: ['child'] }));
      expect(s.total()).toEqual({ input: 800, output: 80 });
    });

    it('carries cache and reasoning counts', () => {
      const s = createSession();
      s.begin('p');
      s.feed({
        method: 'thread/tokenUsage/updated',
        params: {
          threadId: 'p',
          turnId: 'p-turn',
          tokenUsage: {
            total: {
              inputTokens: 100,
              cachedInputTokens: 60,
              cacheWriteInputTokens: 7,
              outputTokens: 10,
              reasoningOutputTokens: 4,
            },
            last: breakdown({ input: 100, output: 10 }),
          },
        },
      });
      expect(s.ledger.turnUsage()).toEqual({
        inputTokens: 100,
        cachedInputTokens: 60,
        cacheWriteInputTokens: 7,
        outputTokens: 10,
        reasoningOutputTokens: 4,
      });
    });

    it('never bills a negative or non-numeric count', () => {
      const s = createSession();
      s.begin('p');
      s.feed({
        method: 'thread/tokenUsage/updated',
        params: {
          threadId: 'p',
          turnId: 'p-turn',
          tokenUsage: {
            total: {
              inputTokens: -50,
              outputTokens: Number.NaN,
              cachedInputTokens: 'x',
            },
            last: { inputTokens: -50 },
          },
        },
      } as CodexAppServerNotification);
      expect(s.ledger.turnUsage()).toEqual({
        inputTokens: 0,
        cachedInputTokens: 0,
        cacheWriteInputTokens: 0,
        outputTokens: 0,
        reasoningOutputTokens: 0,
      });
    });
  });

  describe('carry-over and queued announcements', () => {
    it('hands carried-over usage to exactly one turn', () => {
      const s = createSession();
      s.begin('p', { turnId: 't1' });
      s.ledger.end();
      s.feed(
        usageNotification({
          threadId: 'p',
          turnId: 't1',
          total: { input: 60, output: 6 },
        }),
      );
      s.begin('p', { resumed: true, turnId: 't2' });
      expect(s.total()).toEqual({ input: 60, output: 6 });
      s.ledger.end();
      s.begin('p', { resumed: true, turnId: 't3' });
      expect(s.total()).toEqual({ input: 0, output: 0 });
    });

    it('keeps usage that was received but not billed when the process goes away', () => {
      const s = createSession();
      s.begin('p', { turnId: 't1' });
      s.feed(
        collabNotification({ sender: 'p', receivers: ['c'], turnId: 't1' }),
      );
      s.ledger.end();
      s.feed(
        usageNotification({
          threadId: 'c',
          turnId: 'c1',
          total: { input: 8174, output: 90 },
        }),
      );
      s.ledger.reset(); // the app-server was closed before the next turn
      s.begin('p', { resumed: true, turnId: 't2' });
      expect(s.total()).toEqual({ input: 8174, output: 90 });
    });

    it('does not let a later wait weaken a queued spawn announcement', () => {
      const s = createSession();
      s.begin('p');
      s.feed(
        collabNotification({
          sender: 'child',
          receivers: ['g'],
          tool: 'spawnAgent',
        }),
        collabNotification({ sender: 'child', receivers: ['g'], tool: 'wait' }),
        usageNotification({
          threadId: 'g',
          turnId: 'g1',
          total: { input: 30, output: 3 },
          last: { input: 10, output: 1 },
        }),
        collabNotification({ sender: 'p', receivers: ['child'] }),
      );
      expect(s.total()).toEqual({ input: 30, output: 3 });
    });
  });

  describe('bounds', () => {
    it('drops unrelated threads past the limit with a warning, never family threads', () => {
      const s = createSession();
      s.begin('p');
      s.feed(collabNotification({ sender: 'p', receivers: ['c'] }));
      for (let i = 0; i < 1100; i++) {
        s.feed(
          usageNotification({
            threadId: `stranger-${i}`,
            turnId: 's',
            total: { input: 1, output: 1 },
          }),
        );
      }
      s.feed(
        usageNotification({
          threadId: 'c',
          turnId: 'c1',
          total: { input: 40, output: 4 },
        }),
      );
      expect(s.total()).toEqual({ input: 40, output: 4 });
      expect(s.warnings.length).toBeGreaterThan(0);
    });

    it('still bills a child whose early usage was dropped, from its next cumulative snapshot', () => {
      const s = createSession();
      s.begin('p');
      s.feed(
        usageNotification({
          threadId: 'late-child',
          turnId: 'c',
          total: { input: 10, output: 1 },
        }),
      );
      for (let i = 0; i < 300; i++) {
        s.feed(
          usageNotification({
            threadId: `stranger-${i}`,
            turnId: 's',
            total: { input: 1, output: 1 },
          }),
        );
      }
      s.feed(
        collabNotification({ sender: 'p', receivers: ['late-child'] }),
        usageNotification({
          threadId: 'late-child',
          turnId: 'c',
          total: { input: 60, output: 6 },
        }),
      );
      expect(s.total()).toEqual({ input: 60, output: 6 });
    });
  });

  it('reports each growth of the running total and nothing else', () => {
    const s = createSession();
    const onChange = vi.fn();
    s.ledger.begin({ threadId: 'p', resumed: false, onChange });
    s.ledger.setTurnId('p-turn');
    const at = (input: number) =>
      usageNotification({
        threadId: 'p',
        turnId: 'p-turn',
        total: { input, output: 0 },
      });
    s.feed(at(10), at(10), at(25));
    expect(onChange.mock.calls.map(([usage]) => usage.inputTokens)).toEqual([
      10, 25,
    ]);
  });
});

describe('real recorded trace (parent + two sub-agents, 128,100 in / 1,817 out)', () => {
  const trace = JSON.parse(
    readFileSync(
      new URL('./__fixtures__/subagent-usage-trace.json', import.meta.url),
      'utf8',
    ),
  ) as { activeThreadId: string; notifications: CodexAppServerNotification[] };

  const replay = (
    notifications: CodexAppServerNotification[],
    ledger: CodexUsageLedger = createCodexUsageLedger(),
  ) => {
    const reported: Counts[] = [];
    ledger.begin({
      threadId: trace.activeThreadId,
      resumed: false,
      onChange: usage => reported.push(counts(usage)),
    });
    for (const notification of notifications) {
      const params = notification.params as {
        threadId?: string;
        turn?: { id?: string };
      };
      if (
        notification.method === 'turn/started' &&
        params.threadId === trace.activeThreadId &&
        params.turn?.id != null
      ) {
        ledger.setTurnId(params.turn.id);
      }
      ledger.handleNotification(notification);
    }
    return { reported, total: counts(ledger.turnUsage()) };
  };

  it('adds up to what every thread used', () => {
    expect(replay(trace.notifications).total).toEqual({
      input: 128_100,
      output: 1_817,
    });
  });

  it('has billed exactly what the announced threads used at every point it could be cut', () => {
    for (let cut = 1; cut <= trace.notifications.length; cut++) {
      const prefix = trace.notifications.slice(0, cut);
      // Independent expectation: the latest total of every thread that is the
      // active thread or has been announced by then.
      const ours = new Set([trace.activeThreadId]);
      const latest = new Map<string, Counts>();
      for (const notification of prefix) {
        const params = notification.params as {
          threadId: string;
          item?: { type: string; receiverThreadIds?: string[] };
          tokenUsage?: { total: { inputTokens: number; outputTokens: number } };
        };
        if (notification.method === 'thread/tokenUsage/updated') {
          latest.set(params.threadId, {
            input: params.tokenUsage!.total.inputTokens,
            output: params.tokenUsage!.total.outputTokens,
          });
        } else if (
          params.item?.type === 'collabAgentToolCall' &&
          ours.has(params.threadId)
        ) {
          for (const id of params.item.receiverThreadIds ?? []) ours.add(id);
        }
      }
      let expected: Counts = { input: 0, output: 0 };
      for (const id of ours) {
        const total = latest.get(id);
        if (total)
          expected = {
            input: expected.input + total.input,
            output: expected.output + total.output,
          };
      }
      expect(replay(prefix).total, `cut after ${cut} notifications`).toEqual(
        expected,
      );
    }
  });

  it('is unchanged when every snapshot is delivered twice', () => {
    const doubled = trace.notifications.flatMap(notification => [
      notification,
      notification,
    ]);
    expect(replay(doubled).total).toEqual({ input: 128_100, output: 1_817 });
  });

  it('is unchanged when child usage arrives before the spawns are announced', () => {
    const isUsage = (n: CodexAppServerNotification) =>
      n.method === 'thread/tokenUsage/updated';
    const isAnnouncement = (n: CodexAppServerNotification) =>
      n.method.startsWith('item/');
    const usageFirst = [
      ...trace.notifications.filter(isUsage),
      ...trace.notifications.filter(isAnnouncement),
    ];
    expect(replay(usageFirst).total).toEqual({ input: 128_100, output: 1_817 });
  });

  it('is unchanged when the turn is detached and re-attached in the middle', () => {
    const ledger = createCodexUsageLedger();
    const half = Math.floor(trace.notifications.length / 2);
    const first = replay(trace.notifications.slice(0, half), ledger);
    ledger.end();
    // Everything after the cut is reported while no turn is attached ...
    for (const notification of trace.notifications.slice(half)) {
      ledger.handleNotification(notification);
    }
    // ... and is billed to the next turn, so nothing is lost overall.
    ledger.begin({
      threadId: trace.activeThreadId,
      resumed: true,
      onChange: () => {},
    });
    const second = counts(ledger.turnUsage());
    expect({
      input: first.total.input + second.input,
      output: first.total.output + second.output,
    }).toEqual({ input: 128_100, output: 1_817 });
  });
});
