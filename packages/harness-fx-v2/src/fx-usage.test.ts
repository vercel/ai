import { describe, expect, test } from 'vitest';
import {
  addHarnessUsage,
  createErrorStepSummary,
  createUnknownHarnessUsage,
  toFxStepSummary,
  toFxTurnFinishReason,
} from './fx-usage';

describe('toFxStepSummary', () => {
  test('reads the finish reason and usage of a finish part', () => {
    expect(
      toFxStepSummary({
        finishPart: {
          type: 'finish',
          finishReason: { unified: 'tool-calls', raw: 'tool_use' },
          usage: {
            inputTokens: { total: 10, noCache: 8, cacheRead: 2 },
            outputTokens: { total: 5, reasoning: 1 },
            raw: { input_tokens: 10 },
          },
        },
      }),
    ).toMatchInlineSnapshot(`
      {
        "finishReason": {
          "raw": "tool_use",
          "unified": "tool-calls",
        },
        "usage": {
          "inputTokens": {
            "cacheRead": 2,
            "cacheWrite": undefined,
            "noCache": 8,
            "total": 10,
          },
          "outputTokens": {
            "reasoning": 1,
            "text": undefined,
            "total": 5,
          },
          "raw": {
            "input_tokens": 10,
          },
        },
      }
    `);
  });

  test('maps an unknown finish reason to other', () => {
    expect(
      toFxStepSummary({
        finishPart: { type: 'finish', finishReason: { unified: 'odd' } },
      }).finishReason,
    ).toEqual({ unified: 'other', raw: undefined });
  });
});

describe('addHarnessUsage', () => {
  test('sums known counts and keeps unknown counts unknown', () => {
    const left = toFxStepSummary({
      finishPart: {
        usage: { inputTokens: { total: 10 }, outputTokens: { total: 5 } },
      },
    }).usage;
    const right = toFxStepSummary({
      finishPart: {
        usage: { inputTokens: { total: 3 }, outputTokens: { text: 2 } },
      },
    }).usage;

    expect(addHarnessUsage({ left, right })).toMatchInlineSnapshot(`
      {
        "inputTokens": {
          "cacheRead": undefined,
          "cacheWrite": undefined,
          "noCache": undefined,
          "total": 13,
        },
        "outputTokens": {
          "reasoning": undefined,
          "text": 2,
          "total": 5,
        },
      }
    `);
    expect(
      addHarnessUsage({ left: createUnknownHarnessUsage(), right: left }),
    ).toMatchObject({ inputTokens: { total: 10 } });
  });
});

describe('toFxTurnFinishReason', () => {
  test('uses the last step reason for a normal end of turn', () => {
    expect(
      toFxTurnFinishReason({
        stopReason: 'end_turn',
        lastStep: {
          finishReason: { unified: 'stop', raw: 'end_turn' },
          usage: createUnknownHarnessUsage(),
        },
      }),
    ).toEqual({ unified: 'stop', raw: 'end_turn' });
  });

  test('finishes with an error when the last model call failed', () => {
    expect(
      toFxTurnFinishReason({
        stopReason: 'refused',
        lastStep: createErrorStepSummary(),
      }),
    ).toEqual({ unified: 'error', raw: undefined });
  });

  test('maps the other libfx stop reasons', () => {
    expect(
      ['max_output_tokens', 'refused', 'cancelled', 'max_turns'].map(
        stopReason => toFxTurnFinishReason({ stopReason }),
      ),
    ).toMatchInlineSnapshot(`
      [
        {
          "raw": "max_output_tokens",
          "unified": "length",
        },
        {
          "raw": "refused",
          "unified": "content-filter",
        },
        {
          "raw": "cancelled",
          "unified": "interrupted",
        },
        {
          "raw": "max_turns",
          "unified": "other",
        },
      ]
    `);
  });
});
