import type { RunInterruptedResult } from './types.js';

/** Returns whether a value is an interrupted run result. */
export function isRunInterruptedResult(
  value: unknown,
): value is RunInterruptedResult<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { status?: unknown }).status === 'interrupted' &&
    Array.isArray((value as { interruptions?: unknown }).interruptions) &&
    'continuation' in value
  );
}
