/*
 * Random event sequences against an independent oracle (the true usage of the
 * session's own threads). The ledger must never bill more than that, and when
 * delivery is complete it must bill exactly that.
 */
import { describe, expect, it } from 'vitest';
import {
  createCodexUsageLedger,
  type UsageBreakdown,
} from './codex-usage-ledger';

// Seeded PRNG so failures are reproducible.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
}
type Ev =
  | { k: 'usage'; thread: string; turnId: string; total: number; last: number }
  | {
      k: 'ann';
      sender: string;
      turnId: string;
      tool: string;
      receivers: string[];
    }
  | { k: 'begin' }
  | { k: 'end' };

type Opts = {
  dup: boolean;
  drop: boolean;
  reorder: boolean;
  unrelated: boolean;
  waitFirst: boolean;
  resetCounter: boolean;
  abortGaps: boolean;
  announceLate: boolean;
};

function gen(seed: number, o: Opts) {
  const r = rng(seed);
  const pick = <T>(a: T[]) => a[Math.floor(r() * a.length)]!;
  const family = ['P'];
  const unrelated = ['U0'];
  const truth = new Map<string, number>(); // true cumulative consumed per thread
  const reported = new Map<string, number>(); // counter as reported (may reset)
  const evs: Ev[] = [];
  const pendingAnn: Ev[] = [];
  let turn = 0;
  let attached = false;
  const begin = () => {
    evs.push({ k: 'begin' });
    attached = true;
    turn++;
  };
  begin();
  const steps = 10 + Math.floor(r() * 40);
  for (let i = 0; i < steps; i++) {
    const x = r();
    // Events of one thread are ordered: an announcement cannot outlive its turn.
    if (x < 0.1 && attached) {
      evs.push(...pendingAnn.splice(0), { k: 'end' });
      attached = false;
      continue;
    }
    if (x < 0.2 && !attached) {
      begin();
      continue;
    }
    if (x < 0.3) {
      const sender = pick(family);
      // The primary thread can only spawn while its own turn is running.
      if (sender === 'P' && !attached) continue;
      const child = 'C' + family.length;
      family.push(child);
      const ann: Ev = {
        k: 'ann',
        sender,
        turnId: sender === 'P' ? 't' + turn : 'x',
        tool: 'spawnAgent',
        receivers: [child],
      };
      if (o.waitFirst && r() < 0.5) evs.push({ ...ann, tool: 'wait' } as Ev);
      if (o.announceLate && r() < 0.5) pendingAnn.push(ann);
      else evs.push(ann);
      continue;
    }
    if (o.unrelated && x < 0.35) {
      const sender = pick(unrelated);
      const child = 'U' + unrelated.length;
      unrelated.push(child);
      evs.push({
        k: 'ann',
        sender,
        turnId: 'y',
        tool: 'spawnAgent',
        receivers: [child],
      });
      continue;
    }
    if (pendingAnn.length && r() < 0.3) {
      evs.push(pendingAnn.shift()!);
      continue;
    }
    // a model call on some thread
    const thread = o.unrelated && r() < 0.2 ? pick(unrelated) : pick(family);
    const last = 1 + Math.floor(r() * 100);
    truth.set(thread, (truth.get(thread) ?? 0) + last);
    let rep = (reported.get(thread) ?? 0) + last;
    if (o.resetCounter && r() < 0.05) rep = last; // counter reset by server
    reported.set(thread, rep);
    // primary snapshots carry the current turn id (or previous one if detached)
    const e: Ev = {
      k: 'usage',
      thread,
      turnId: thread === 'P' ? 't' + turn : 'z',
      total: rep,
      last,
    };
    evs.push(e);
    if (o.dup && r() < 0.3) evs.push({ ...e });
  }
  if (attached) evs.push(...pendingAnn.splice(0));
  else evs.push({ k: 'begin' }, ...pendingAnn.splice(0), { k: 'end' });
  // perturb delivery
  let out = evs.slice();
  if (o.drop)
    out = out.filter(
      (e, i) =>
        !(
          e.k === 'usage' &&
          r() < 0.2 &&
          out.slice(i + 1).some(f => f.k === 'usage' && f.thread === e.thread)
        ),
    );
  if (o.reorder)
    for (let i = 0; i + 1 < out.length; i++)
      if (out[i]!.k === 'usage' && out[i + 1]!.k === 'usage' && r() < 0.3)
        [out[i], out[i + 1]] = [out[i + 1]!, out[i]!];
  // final flush turn
  if (out.at(-1)?.k !== 'end') out.push({ k: 'end' });
  out.push({ k: 'begin' }, { k: 'end' });
  const familyTruth = family.reduce((a, t) => a + (truth.get(t) ?? 0), 0);
  return { out, familyTruth, family };
}

const usage = (n: number): UsageBreakdown => ({
  inputTokens: n,
  cachedInputTokens: 0,
  cacheWriteInputTokens: 0,
  outputTokens: 0,
  reasoningOutputTokens: 0,
});

function run(out: Ev[]) {
  const ledger = createCodexUsageLedger();
  let billed = 0;
  let turn = 0;
  let attached = false;
  for (const e of out) {
    if (e.k === 'begin') {
      if (attached) continue;
      turn++;
      attached = true;
      ledger.begin({ threadId: 'P', resumed: false, onChange: () => {} });
      ledger.setTurnId('t' + turn);
    } else if (e.k === 'end') {
      if (!attached) continue;
      billed += ledger.turnUsage().inputTokens;
      ledger.end();
      attached = false;
    } else if (e.k === 'usage') {
      ledger.handleNotification({
        method: 'thread/tokenUsage/updated',
        params: {
          threadId: e.thread,
          turnId: e.turnId,
          tokenUsage: { total: usage(e.total), last: usage(e.last) },
        },
      });
    } else {
      ledger.handleNotification({
        method: 'item/completed',
        params: {
          threadId: e.sender,
          turnId: e.turnId,
          item: {
            type: 'collabAgentToolCall',
            tool: e.tool,
            receiverThreadIds: e.receivers,
          },
        },
      });
    }
  }
  return billed;
}

const base: Opts = {
  dup: false,
  drop: false,
  reorder: false,
  unrelated: false,
  waitFirst: false,
  resetCounter: false,
  abortGaps: false,
  announceLate: false,
};
const scenarios: Array<[string, Partial<Opts>, 'eq' | 'le']> = [
  ['clean', {}, 'eq'],
  ['dup', { dup: true }, 'eq'],
  ['drop non-final', { drop: true }, 'eq'],
  ['unrelated threads', { unrelated: true }, 'eq'],
  ['late announcements', { announceLate: true }, 'eq'],
  ['wait before spawn', { waitFirst: true }, 'le'],
  ['reorder', { reorder: true }, 'le'],
  ['counter reset', { resetCounter: true }, 'le'],
  [
    'everything',
    {
      dup: true,
      drop: true,
      reorder: true,
      unrelated: true,
      waitFirst: true,
      resetCounter: true,
      announceLate: true,
    },
    'le',
  ],
];

describe('usage ledger fuzz (seeded, against an oracle)', () => {
  for (const [name, o, mode] of scenarios) {
    it(name, () => {
      const fails: string[] = [];
      for (let seed = 1; seed <= 500; seed++) {
        const { out, familyTruth } = gen(seed, { ...base, ...o });
        const billed = run(out);
        if (billed > familyTruth)
          fails.push(`OVER seed=${seed} billed=${billed} truth=${familyTruth}`);
        else if (mode === 'eq' && billed !== familyTruth)
          fails.push(`LOSS seed=${seed} billed=${billed} truth=${familyTruth}`);
      }
      expect(fails).toEqual([]);
    });
  }
});
