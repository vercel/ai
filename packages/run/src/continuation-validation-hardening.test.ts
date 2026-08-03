import { describe, expect, it } from 'vitest';
import { assertContinuationState } from '../dist/continuation-validation.js';
import type { RunContinuationState } from '../dist/index.js';
import { normalizeOptions } from '../dist/utils/options.js';

const source = `
  await tools.first({ value: 1 });
  try { await tools.second({ value: 2 }); } catch {}
  return await tools.pause({ value: 3 });
`;
const scopeHash = '02'.repeat(32);

describe('continuation state validation hardening', () => {
  it('accepts only the exact versioned state shape', () => {
    expect(() =>
      assertContinuationState(
        validState(),
        source,
        scopeHash,
        normalizeOptions(),
      ),
    ).not.toThrow();
    for (const mutation of [
      (state: Record<string, unknown>) => (state.extra = true),
      (state: Record<string, unknown>) =>
        ((state.determinism as Record<string, unknown>).extra = true),
      (state: Record<string, unknown>) =>
        (((state.ledger as unknown[])[0] as Record<string, unknown>).extra =
          true),
    ]) {
      const state = validState() as unknown as Record<string, unknown>;
      mutation(state);
      expectInvalid(state);
    }
  });

  it('rejects sparse arrays, cycles, accessors, and non-plain objects', () => {
    const sparse = validState();
    sparse.ledger = new Array(3) as typeof sparse.ledger;
    sparse.ledger[0] = validState().ledger[0]!;
    sparse.ledger[2] = validState().ledger[2]!;
    expectInvalid(sparse);

    const cycle = validState() as RunContinuationState & { cycle?: unknown };
    cycle.cycle = cycle;
    expectInvalid(cycle);

    const accessor = validState();
    Object.defineProperty(accessor.determinism, 'randomSeed', {
      get() {
        throw new Error('accessor failure');
      },
    });
    expectInvalid(accessor);

    expectInvalid({ ...validState(), determinism: new Date() });
  });

  it('fails closed for 10,000 structure-aware state mutations', () => {
    let random = 0xa341316c;
    for (let iteration = 0; iteration < 10_000; iteration++) {
      const state = validState() as unknown as Record<string, unknown>;
      const ledger = state.ledger as Array<Record<string, unknown>>;
      switch (next() % 12) {
        case 0:
          state.version = next();
          break;
        case 1:
          state.runtime = `runtime-${next()}`;
          break;
        case 2:
          state.source = `${source}\n${next()}`;
          break;
        case 3:
          (state.determinism as Record<string, unknown>).randomSeed =
            `${next()}`;
          break;
        case 4:
          (state.determinism as Record<string, unknown>).dateNowMs = -1;
          break;
        case 5:
          ledger[next() % ledger.length]!.bindingName = 'constructor';
          break;
        case 6:
          ledger[next() % ledger.length]!.inputJson = '{';
          break;
        case 7:
          ledger[0]!.settledOrder = 2;
          break;
        case 8:
          ledger[1]!.error = { name: 'Error', message: 'x', extra: true };
          break;
        case 9:
          ledger[2]!.interruptionId = `interrupt-${next()}`;
          break;
        case 10:
          ledger[2]!.payloadJson = '{';
          break;
        default:
          ledger[next() % ledger.length]!.extra = generatedJson(0);
      }
      expectInvalid(state);
    }

    function next(): number {
      random ^= random << 13;
      random ^= random >>> 17;
      random ^= random << 5;
      return random >>> 0;
    }

    function generatedJson(depth: number): unknown {
      if (depth > 2) return next() % 2 === 0 ? next() : `v-${next()}`;
      return next() % 2 === 0
        ? Array.from({ length: next() % 4 }, () => generatedJson(depth + 1))
        : { value: generatedJson(depth + 1) };
    }
  });

  it('enforces exact aggregate state bytes rather than an entry estimate', () => {
    const state = validState();
    const exactBytes = Buffer.byteLength(JSON.stringify(state));
    expect(() =>
      assertContinuationState(state, source, scopeHash, {
        ...normalizeOptions(),
        maxContinuationBytes: exactBytes,
      }),
    ).not.toThrow();
    expect(() =>
      assertContinuationState(state, source, scopeHash, {
        ...normalizeOptions(),
        maxContinuationBytes: exactBytes - 1,
      }),
    ).toThrowError(expect.objectContaining({ code: 'RUN_PROTOCOL_ERROR' }));
  });
});

function expectInvalid(value: unknown): void {
  expect(() =>
    assertContinuationState(value, source, scopeHash, normalizeOptions()),
  ).toThrowError(expect.objectContaining({ code: 'RUN_PROTOCOL_ERROR' }));
}

function validState(): RunContinuationState {
  return {
    version: 2,
    runtime: 'run-replay-v2',
    serde: 'run-js-v1',
    source,
    logicalRunId: '03'.repeat(16),
    scopeHash,
    determinism: {
      dateNowMs: 1_700_000_000_000,
      randomSeed: '01'.repeat(16),
    },
    ledger: [
      {
        bindingName: 'tools.first',
        inputJson: '[[1],{"value":2},1]',
        status: 'fulfilled',
        settledOrder: 1,
        dateNowMs: 1_700_000_000_001,
        valueJson: '[true]',
      },
      {
        bindingName: 'tools.second',
        inputJson: '[[1],{"value":2},2]',
        status: 'rejected',
        settledOrder: 2,
        dateNowMs: 1_700_000_000_002,
        error: { name: 'Error', message: 'expected' },
      },
      {
        bindingName: 'tools.pause',
        inputJson: '[[1],{"value":2},3]',
        status: 'interrupted',
        interruptionId: 'interrupt-3',
        payloadJson: '[{"kind":1},"pause"]',
      },
    ],
  };
}
