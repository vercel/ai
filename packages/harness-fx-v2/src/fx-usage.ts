import type { HarnessV2FinishReason, HarnessV2Usage } from '@ai-sdk/harness';
import type { JSONObject } from '@ai-sdk/provider';

/**
 * Finish reason and usage of one step, i.e. of one model response.
 */
export type FxStepSummary = {
  /**
   * Reason the model response finished.
   */
  finishReason: HarnessV2FinishReason;

  /**
   * Usage of the model response.
   */
  usage: HarnessV2Usage;
};

/**
 * Returns usage with every token count unknown, the starting point for
 * summing the usage of a turn's steps.
 */
export function createUnknownHarnessUsage(): HarnessV2Usage {
  return {
    inputTokens: {
      total: undefined,
      noCache: undefined,
      cacheRead: undefined,
      cacheWrite: undefined,
    },
    outputTokens: {
      total: undefined,
      text: undefined,
      reasoning: undefined,
    },
  };
}

/**
 * Adds two token counts, treating an unknown count as absent rather than
 * zero: the sum is unknown only when both counts are unknown.
 */
function addTokenCount(options: {
  /**
   * First count.
   */
  left?: number;

  /**
   * Second count.
   */
  right?: number;
}): number | undefined {
  const { left, right } = options;
  if (left === undefined) return right;
  if (right === undefined) return left;
  return left + right;
}

/**
 * Sums two usages field by field, e.g. to aggregate a turn's steps. The raw
 * usage is not aggregated.
 */
export function addHarnessUsage(options: {
  /**
   * First usage.
   */
  left: HarnessV2Usage;

  /**
   * Second usage.
   */
  right: HarnessV2Usage;
}): HarnessV2Usage {
  const { left, right } = options;
  return {
    inputTokens: {
      total: addTokenCount({
        left: left.inputTokens.total,
        right: right.inputTokens.total,
      }),
      noCache: addTokenCount({
        left: left.inputTokens.noCache,
        right: right.inputTokens.noCache,
      }),
      cacheRead: addTokenCount({
        left: left.inputTokens.cacheRead,
        right: right.inputTokens.cacheRead,
      }),
      cacheWrite: addTokenCount({
        left: left.inputTokens.cacheWrite,
        right: right.inputTokens.cacheWrite,
      }),
    },
    outputTokens: {
      total: addTokenCount({
        left: left.outputTokens.total,
        right: right.outputTokens.total,
      }),
      text: addTokenCount({
        left: left.outputTokens.text,
        right: right.outputTokens.text,
      }),
      reasoning: addTokenCount({
        left: left.outputTokens.reasoning,
        right: right.outputTokens.reasoning,
      }),
    },
  };
}

/**
 * Returns a value as a plain object, or `undefined`.
 */
function asObject(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/**
 * Returns a value as a number, or `undefined`.
 */
function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

const UNIFIED_FINISH_REASONS = new Set<HarnessV2FinishReason['unified']>([
  'stop',
  'length',
  'content-filter',
  'tool-calls',
  'error',
  'interrupted',
  'other',
]);

/**
 * Returns the step summary of a model response from its `finish` stream
 * part, a language model `finish` part as AI Gateway streams it. Missing
 * token counts stay unknown, and an unrecognized finish reason becomes
 * `other`.
 */
export function toFxStepSummary(options: {
  /**
   * The response's `finish` stream part.
   */
  finishPart: Record<string, unknown>;
}): FxStepSummary {
  const finishReason = asObject(options.finishPart.finishReason);
  const usage = asObject(options.finishPart.usage);
  const inputTokens = asObject(usage?.inputTokens);
  const outputTokens = asObject(usage?.outputTokens);
  const unified = finishReason?.unified;
  const raw = asObject(usage?.raw);
  const summary: FxStepSummary = {
    finishReason: {
      unified:
        typeof unified === 'string' &&
        UNIFIED_FINISH_REASONS.has(unified as HarnessV2FinishReason['unified'])
          ? (unified as HarnessV2FinishReason['unified'])
          : 'other',
      raw: typeof finishReason?.raw === 'string' ? finishReason.raw : undefined,
    },
    usage: {
      inputTokens: {
        total: asNumber(inputTokens?.total),
        noCache: asNumber(inputTokens?.noCache),
        cacheRead: asNumber(inputTokens?.cacheRead),
        cacheWrite: asNumber(inputTokens?.cacheWrite),
      },
      outputTokens: {
        total: asNumber(outputTokens?.total),
        text: asNumber(outputTokens?.text),
        reasoning: asNumber(outputTokens?.reasoning),
      },
    },
  };
  if (raw != null) summary.usage.raw = raw as JSONObject;
  return summary;
}

/**
 * Returns the summary of a step whose model call failed.
 */
export function createErrorStepSummary(): FxStepSummary {
  return {
    finishReason: { unified: 'error', raw: undefined },
    usage: createUnknownHarnessUsage(),
  };
}

/**
 * Maps how libfx ended a turn to the turn's finish reason.
 *
 * A turn whose last model call failed finishes with `error`. Otherwise a
 * turn libfx ended normally (`end_turn`) finishes with its last step's
 * reason, and the other stop reasons map to `length`, `content-filter`,
 * `other` and `interrupted`, keeping libfx's stop reason as the raw reason.
 */
export function toFxTurnFinishReason(options: {
  /**
   * libfx's stop reason of the turn.
   */
  stopReason: string;

  /**
   * Summary of the turn's last step, if it had any.
   */
  lastStep?: FxStepSummary;
}): HarnessV2FinishReason {
  const { stopReason, lastStep } = options;
  if (lastStep?.finishReason.unified === 'error') return lastStep.finishReason;
  switch (stopReason) {
    case 'end_turn':
      return lastStep?.finishReason ?? { unified: 'other', raw: stopReason };
    case 'max_output_tokens':
      return { unified: 'length', raw: stopReason };
    case 'refused':
      return { unified: 'content-filter', raw: stopReason };
    case 'cancelled':
      return { unified: 'interrupted', raw: stopReason };
    default:
      return { unified: 'other', raw: stopReason };
  }
}
