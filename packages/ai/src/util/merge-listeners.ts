import type { Listener } from '../util/notify';

/**
 * Creates an async listener that invokes the provided event listeners in parallel.
 * Undefined event listeners are skipped, and thrown or rejected callback errors are
 * ignored.
 *
 * @param listeners The event listeners to invoke for each event.
 * @returns A listener that forwards each event to all event listeners and waits for
 * them to settle.
 */
export function mergeListeners<EVENT>(
  ...listeners: Array<Listener<EVENT> | undefined>
): Listener<EVENT> {
  return async (event: EVENT) => {
    await Promise.allSettled(
      listeners.map(async listener => {
        await listener?.(event);
      }),
    );
  };
}
