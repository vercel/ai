import type { Listener } from '../util/notify';

/**
 * Creates a listener that invokes the provided callbacks in order.
 * Undefined callbacks are skipped and callback errors are ignored so later
 * callbacks still run.
 *
 * @param callbacks The callbacks to invoke for each event.
 * @returns A listener that forwards the event to each callback sequentially.
 */
export function mergeListeners<EVENT>(
  ...callbacks: Array<Listener<EVENT> | undefined>
): Listener<EVENT> | undefined {
  return (async (event: EVENT) => {
    for (const callback of callbacks) {
      try {
        await callback?.(event);
      } catch (_ignored) {}
    }
  }) as unknown as Listener<EVENT>;
}
