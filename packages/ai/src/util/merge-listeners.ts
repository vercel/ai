import type { Listener } from '../util/notify';

/**
 * Creates an async listener that invokes the provided callbacks in parallel.
 * Undefined callbacks are skipped, and thrown or rejected callback errors are
 * ignored.
 *
 * @param callbacks The callbacks to invoke for each event.
 * @returns A listener that forwards each event to all callbacks and waits for
 * them to settle.
 */
export function mergeListeners<EVENT>(
  ...callbacks: Array<Listener<EVENT> | undefined>
): Listener<EVENT> {
  return async (event: EVENT) => {
    await Promise.allSettled(
      callbacks.map(async callback => {
        await callback?.(event);
      }),
    );
  };
}
