import { InvalidArgumentError } from 'ai';

/**
 * Largest delay that JavaScript timers support. A longer delay does not wait
 * longer: the timer fires after 1 ms.
 */
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

/**
 * Timeout configuration for a workflow agent call.
 *
 * A number is the total deadline in milliseconds. The object form can also
 * limit each model call and, in `stream()`, the wait for model output.
 */
export type WorkflowAgentTimeoutConfiguration =
  | number
  | {
      /**
       * Deadline for the model calls of the whole run, in milliseconds.
       * The same deadline stays in effect after a tool suspends and resumes.
       */
      totalMs?: number;

      /**
       * Time limit for each model call, in milliseconds. It covers dispatch,
       * SDK retries, and reading the response. Tool execution is not included.
       */
      stepMs?: number;

      /**
       * Time limit for the first output chunk of each model call, in
       * milliseconds. Used by `stream()` only.
       */
      firstChunkMs?: number;

      /**
       * Time limit between two output chunks of a model call, in milliseconds.
       * Used by `stream()` only.
       */
      chunkMs?: number;
    };

/**
 * Timeout values of a call after validation.
 */
export interface WorkflowAgentTimeoutSettings {
  totalTimeoutMs?: number;
  stepTimeoutMs?: number;
  firstChunkTimeoutMs?: number;
  chunkTimeoutMs?: number;
}

/**
 * Validates a timeout configuration and returns its values.
 *
 * Timers treat a value that is not a number, is negative, or is too large as
 * a delay of 1 ms, so such a value would end the call almost immediately.
 * It is rejected here, before the values reach a durable step.
 *
 * A negative total is the one exception. It is a deadline that has already
 * passed, for example the rest of a time budget, and the call ends as
 * timed out before its first model call.
 */
export function resolveTimeoutSettings(
  timeout: WorkflowAgentTimeoutConfiguration | undefined,
): WorkflowAgentTimeoutSettings {
  if (timeout == null) {
    return {};
  }

  if (typeof timeout !== 'object') {
    return {
      totalTimeoutMs: toDeadlineMs(
        validateMs('timeout', timeout, { allowNegative: true }),
      ),
    };
  }

  return {
    totalTimeoutMs: toDeadlineMs(
      validateMs('timeout.totalMs', timeout.totalMs, { allowNegative: true }),
    ),
    stepTimeoutMs: validateMs('timeout.stepMs', timeout.stepMs),
    firstChunkTimeoutMs: validateMs(
      'timeout.firstChunkMs',
      timeout.firstChunkMs,
    ),
    chunkTimeoutMs: validateMs('timeout.chunkMs', timeout.chunkMs),
  };
}

function validateMs(
  parameter: string,
  value: unknown,
  { allowNegative = false }: { allowNegative?: boolean } = {},
): number | undefined {
  if (value == null) {
    return undefined;
  }

  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    (value < 0 && !allowNegative) ||
    value > MAX_TIMEOUT_MS
  ) {
    throw new InvalidArgumentError({
      parameter,
      value,
      message: allowNegative
        ? `${parameter} must be a number of milliseconds of at most ${MAX_TIMEOUT_MS}`
        : `${parameter} must be a number of milliseconds between 0 and ${MAX_TIMEOUT_MS}`,
    });
  }

  return value;
}

// The total deadline is passed to `AbortSignal.timeout()`, which accepts
// whole, non-negative milliseconds only. A deadline in the past has the same
// effect as one that expires now.
function toDeadlineMs(value: number | undefined): number | undefined {
  return value == null ? undefined : Math.max(0, Math.ceil(value));
}
