import type { Listener } from '../util/notify';

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
