import type { Experimental_BatchV4Status as BatchV4Status } from '@ai-sdk/provider';

/**
 * Normalizes complete batch request counts.
 *
 * Returns `undefined` when any count is missing, is not a non-negative safe
 * integer, or when the item counts do not add up to the total.
 */
export function normalizeBatchRequestCounts({
  total,
  pending,
  completed,
  failed,
}: {
  total: number | null | undefined;
  pending: number | null | undefined;
  completed: number | null | undefined;
  failed: number | null | undefined;
}): BatchV4Status['requestCounts'] | undefined {
  if (
    isNonNegativeSafeInteger(total) &&
    isNonNegativeSafeInteger(pending) &&
    isNonNegativeSafeInteger(completed) &&
    isNonNegativeSafeInteger(failed) &&
    pending + completed + failed === total
  ) {
    return {
      total,
      pending,
      completed,
      failed,
    };
  }

  return undefined;
}

function isNonNegativeSafeInteger(
  value: number | null | undefined,
): value is number {
  return value != null && Number.isSafeInteger(value) && value >= 0;
}
