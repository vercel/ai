import type { HarnessV2FinishReason, HarnessV2Usage } from '@ai-sdk/harness';
import type { AssistantMessage, Usage } from '@earendil-works/pi-ai';
import { toJSONObject } from './to-json-value';

/**
 * Converts Pi's token usage of one model response into harness usage. Pi's
 * `input` excludes cached tokens, so the input total adds the cache reads and
 * writes. The raw Pi usage is kept under `raw`.
 */
export function toHarnessUsage(options: {
  /**
   * Pi usage of one model response.
   */
  usage: Usage;
}): HarnessV2Usage {
  const { usage } = options;
  return {
    inputTokens: {
      total: usage.input + usage.cacheRead + usage.cacheWrite,
      noCache: usage.input,
      cacheRead: usage.cacheRead,
      cacheWrite: usage.cacheWrite,
    },
    outputTokens: {
      total: usage.output,
      text:
        usage.reasoning === undefined
          ? undefined
          : usage.output - usage.reasoning,
      reasoning: usage.reasoning,
    },
    raw: toJSONObject({ value: usage }),
  };
}

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
 * Maps the stop reason of a Pi model response to a harness finish reason,
 * keeping Pi's stop reason as the raw reason.
 */
export function toHarnessFinishReason(options: {
  /**
   * Pi model response.
   */
  message: AssistantMessage;
}): HarnessV2FinishReason {
  const raw = options.message.stopReason;
  switch (raw) {
    case 'stop':
      return { unified: 'stop', raw };
    case 'length':
      return { unified: 'length', raw };
    case 'toolUse':
      return { unified: 'tool-calls', raw };
    case 'error':
      return { unified: 'error', raw };
    case 'aborted':
      return { unified: 'interrupted', raw };
    default:
      return { unified: 'other', raw };
  }
}
