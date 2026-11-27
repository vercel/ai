import { HarnessAdapterContractError } from '../../../errors/harness-adapter-contract-error';
import { HarnessCapabilityUnsupportedError } from '../../../errors/harness-capability-unsupported-error';
import { HarnessSandboxAuthenticationError } from '../../../errors/harness-sandbox-authentication-error';

/**
 * Classification of an error thrown out of a drive:
 * - `permanent`: another drive cannot succeed, so the turn ends immediately.
 * - `transient`: the turn stays unfinished so a later drive continues it from
 *   the log, up to the consecutive drive error cap.
 */
export type HarnessAgentDriveErrorKind = 'permanent' | 'transient';

/**
 * Maximum number of error nodes visited when walking `.cause` and
 * `AggregateError.errors`.
 */
const MAX_CAUSE_NODES = 16;

/**
 * Collects `error` and its causal chain (`.cause` and `AggregateError.errors`),
 * bounded by `MAX_CAUSE_NODES` and protected against cycles.
 */
function collectCauseChain(options: {
  /**
   * Root thrown value.
   */
  error: unknown;
}): unknown[] {
  const visited = new Set<unknown>();
  const queue: unknown[] = [options.error];
  const result: unknown[] = [];

  while (queue.length > 0 && result.length < MAX_CAUSE_NODES) {
    const current = queue.shift();
    if (current == null || visited.has(current)) continue;
    visited.add(current);
    result.push(current);

    if (typeof current === 'object') {
      if ('cause' in current && current.cause != null) {
        queue.push(current.cause);
      }
      if (
        'errors' in current &&
        Array.isArray((current as { errors?: unknown }).errors)
      ) {
        for (const nested of (current as { errors: unknown[] }).errors) {
          if (nested != null) queue.push(nested);
        }
      }
    }
  }

  return result;
}

/**
 * Returns whether a single error node represents a missing module failure.
 */
function isMissingModuleError(options: {
  /**
   * Single error node from the causal chain.
   */
  error: unknown;
}): boolean {
  const { error } = options;
  if (error == null || typeof error !== 'object') return false;
  const { code } = error as { code?: unknown };
  return code === 'ERR_MODULE_NOT_FOUND' || code === 'MODULE_NOT_FOUND';
}

/**
 * Classifies an error caught from a drive as `'permanent'` (another drive
 * cannot succeed) or `'transient'` (leave the turn unfinished for a later
 * drive).
 *
 * Permanent errors cover adapter contract violations
 * (`HarnessAdapterContractError`), caller errors
 * (`HarnessCapabilityUnsupportedError`, `HarnessSandboxAuthenticationError`),
 * and missing-module errors (`ERR_MODULE_NOT_FOUND`, `MODULE_NOT_FOUND`),
 * including when wrapped in `.cause` or `AggregateError.errors`.
 * `HarnessInvalidDriveStateError` is intentionally `'transient'` because a
 * fresh drive can recover from stale drive state.
 */
export function classifyDriveError(options: {
  /**
   * Error thrown out of a drive.
   */
  error: unknown;
}): HarnessAgentDriveErrorKind {
  for (const node of collectCauseChain({ error: options.error })) {
    if (
      HarnessAdapterContractError.isInstance(node) ||
      HarnessCapabilityUnsupportedError.isInstance(node) ||
      HarnessSandboxAuthenticationError.isInstance(node) ||
      isMissingModuleError({ error: node })
    ) {
      return 'permanent';
    }
  }

  return 'transient';
}
