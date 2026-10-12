import { describe, expect, it } from 'vitest';
import {
  addLanguageModelUsage,
  asLanguageModelUsage,
  createNullLanguageModelUsage,
  type LanguageModelUsage,
} from './usage';

describe('addLanguageModelUsage', () => {
  it('should preserve raw usage when aggregating a single step', () => {
    const usage: LanguageModelUsage = {
      inputTokens: 10,
      inputTokenDetails: {
        noCacheTokens: undefined,
        cacheReadTokens: undefined,
        cacheWriteTokens: undefined,
      },
      outputTokens: 5,
      outputTokenDetails: {
        textTokens: undefined,
        reasoningTokens: 5,
      },
      totalTokens: 15,
      raw: { totalTokens: 20 },
    };

    expect(
      addLanguageModelUsage(createNullLanguageModelUsage(), usage),
    ).toEqual(usage);
  });

  it('should expose partial top-level token counts without discarding known values', () => {
    const missing = [
      asLanguageModelUsage({
        inputTokens: {
          total: undefined,
          noCache: undefined,
          cacheRead: undefined,
          cacheWrite: undefined,
        },
        outputTokens: {
          total: 1,
          text: undefined,
          reasoning: undefined,
        },
      }),
      asLanguageModelUsage({
        inputTokens: {
          total: 2,
          noCache: undefined,
          cacheRead: undefined,
          cacheWrite: undefined,
        },
        outputTokens: {
          total: 3,
          text: undefined,
          reasoning: undefined,
        },
      }),
    ].reduce(addLanguageModelUsage, createNullLanguageModelUsage());

    const knownZero = [
      asLanguageModelUsage({
        inputTokens: {
          total: 0,
          noCache: undefined,
          cacheRead: undefined,
          cacheWrite: undefined,
        },
        outputTokens: {
          total: 1,
          text: undefined,
          reasoning: undefined,
        },
      }),
      asLanguageModelUsage({
        inputTokens: {
          total: 2,
          noCache: undefined,
          cacheRead: undefined,
          cacheWrite: undefined,
        },
        outputTokens: {
          total: 3,
          text: undefined,
          reasoning: undefined,
        },
      }),
    ].reduce(addLanguageModelUsage, createNullLanguageModelUsage());

    expect(missing).toEqual({
      inputTokens: 2,
      inputTokenDetails: {
        noCacheTokens: undefined,
        cacheReadTokens: undefined,
        cacheWriteTokens: undefined,
      },
      outputTokens: 4,
      outputTokenDetails: {
        textTokens: undefined,
        reasoningTokens: undefined,
      },
      totalTokens: 6,
      incompleteTokenCounts: {
        inputTokens: true,
        totalTokens: true,
      },
    });
    expect(knownZero).toEqual({
      inputTokens: 2,
      inputTokenDetails: {
        noCacheTokens: undefined,
        cacheReadTokens: undefined,
        cacheWriteTokens: undefined,
      },
      outputTokens: 4,
      outputTokenDetails: {
        textTokens: undefined,
        reasoningTokens: undefined,
      },
      totalTokens: 6,
    });
  });

  it('should distinguish the empty accumulator from a step with all counts unknown', () => {
    const unknownUsage = createUsage();
    const knownUsage = createUsage({
      inputTokens: 2,
      outputTokens: 3,
      totalTokens: 5,
    });

    expect(
      addLanguageModelUsage(
        addLanguageModelUsage(createNullLanguageModelUsage(), unknownUsage),
        knownUsage,
      ),
    ).toEqual({
      inputTokens: 2,
      inputTokenDetails: {
        noCacheTokens: undefined,
        cacheReadTokens: undefined,
        cacheWriteTokens: undefined,
      },
      outputTokens: 3,
      outputTokenDetails: {
        textTokens: undefined,
        reasoningTokens: undefined,
      },
      totalTokens: 5,
      incompleteTokenCounts: {
        inputTokens: true,
        outputTokens: true,
        totalTokens: true,
      },
    });
  });

  it('should expose partial detailed token counts and propagate incompleteness', () => {
    const usage = [
      createUsage({
        inputTokens: 1,
        noCacheTokens: undefined,
        cacheReadTokens: 1,
        cacheWriteTokens: 0,
        outputTokens: 2,
        textTokens: 2,
        reasoningTokens: undefined,
        totalTokens: 3,
      }),
      createUsage({
        inputTokens: 3,
        noCacheTokens: 2,
        cacheReadTokens: undefined,
        cacheWriteTokens: 1,
        outputTokens: 4,
        textTokens: undefined,
        reasoningTokens: 1,
        totalTokens: 7,
      }),
      createUsage({
        inputTokens: 5,
        noCacheTokens: 4,
        cacheReadTokens: 1,
        cacheWriteTokens: 0,
        outputTokens: 6,
        textTokens: 5,
        reasoningTokens: 1,
        totalTokens: 11,
      }),
    ].reduce(addLanguageModelUsage, createNullLanguageModelUsage());

    expect(usage).toEqual({
      inputTokens: 9,
      inputTokenDetails: {
        noCacheTokens: 6,
        cacheReadTokens: 2,
        cacheWriteTokens: 1,
      },
      outputTokens: 12,
      outputTokenDetails: {
        textTokens: 7,
        reasoningTokens: 2,
      },
      totalTokens: 21,
      incompleteTokenCounts: {
        inputTokenDetails: {
          noCacheTokens: true,
          cacheReadTokens: true,
        },
        outputTokenDetails: {
          textTokens: true,
          reasoningTokens: true,
        },
      },
    });
  });
});

function createUsage({
  inputTokens,
  noCacheTokens,
  cacheReadTokens,
  cacheWriteTokens,
  outputTokens,
  textTokens,
  reasoningTokens,
  totalTokens,
}: {
  inputTokens?: number;
  noCacheTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  outputTokens?: number;
  textTokens?: number;
  reasoningTokens?: number;
  totalTokens?: number;
} = {}): LanguageModelUsage {
  return {
    inputTokens,
    inputTokenDetails: {
      noCacheTokens,
      cacheReadTokens,
      cacheWriteTokens,
    },
    outputTokens,
    outputTokenDetails: {
      textTokens,
      reasoningTokens,
    },
    totalTokens,
  };
}
