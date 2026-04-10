import type { Listener } from '../util/notify';

/**
 * Creates an async listener that awaits the provided callbacks in order.
 * Undefined callbacks are skipped, and thrown or rejected callback errors are
 * ignored so later callbacks still run.
 *
 * @param callbacks The callbacks to invoke for each event.
 * @returns A listener that forwards each event to the callbacks sequentially.
 */
export function mergeListeners<EVENT>(
  ...callbacks: Array<Listener<EVENT> | undefined>
): Listener<EVENT> {
  return async (event: EVENT) => {
    for (const callback of callbacks) {
      try {
        await callback?.(event);
      } catch (_ignored) {}
    }
  };
}
