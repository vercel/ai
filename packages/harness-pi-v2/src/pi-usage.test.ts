import type { AssistantMessage, Usage } from '@earendil-works/pi-ai';
import { describe, expect, test } from 'vitest';
import {
  addHarnessUsage,
  createUnknownHarnessUsage,
  toHarnessFinishReason,
  toHarnessUsage,
} from './pi-usage';

const usage: Usage = {
  input: 10,
  output: 5,
  cacheRead: 3,
  cacheWrite: 2,
  reasoning: 1,
  totalTokens: 20,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

describe('toHarnessUsage', () => {
  test('converts Pi usage', () => {
    expect(toHarnessUsage({ usage })).toEqual({
      inputTokens: { total: 15, noCache: 10, cacheRead: 3, cacheWrite: 2 },
      outputTokens: { total: 5, text: 4, reasoning: 1 },
      raw: usage,
    });
  });

  test('leaves the text tokens unknown without a reasoning breakdown', () => {
    const { reasoning: _, ...withoutReasoning } = usage;
    expect(toHarnessUsage({ usage: withoutReasoning }).outputTokens).toEqual({
      total: 5,
      text: undefined,
      reasoning: undefined,
    });
  });
});

describe('addHarnessUsage', () => {
  test('treats unknown counts as absent', () => {
    const step = toHarnessUsage({ usage });
    expect(
      addHarnessUsage({
        left: addHarnessUsage({
          left: createUnknownHarnessUsage(),
          right: step,
        }),
        right: step,
      }),
    ).toEqual({
      inputTokens: { total: 30, noCache: 20, cacheRead: 6, cacheWrite: 4 },
      outputTokens: { total: 10, text: 8, reasoning: 2 },
    });
  });
});

describe('toHarnessFinishReason', () => {
  test.each([
    ['stop', 'stop'],
    ['length', 'length'],
    ['toolUse', 'tool-calls'],
    ['error', 'error'],
    ['aborted', 'interrupted'],
    ['deferred', 'other'],
  ] as const)('maps %s to %s', (stopReason, unified) => {
    expect(
      toHarnessFinishReason({ message: { stopReason } as AssistantMessage }),
    ).toEqual({ unified, raw: stopReason });
  });
});
