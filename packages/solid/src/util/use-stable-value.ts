import { isDeepEqualData } from 'ai';
import { type Accessor, createEffect, createSignal } from 'solid-js';

/**
 * Returns a stable value that only updates the stored value (and triggers a re-render)
 * when the value's contents differ by deep-compare.
 */
export function useStableValue<T>(latestValue: T): Accessor<T> {
  const [value, setValue] = createSignal<T>(latestValue);

  createEffect(() => {
    if (!isDeepEqualData(latestValue, value())) {
      setValue(() => latestValue);
    }
  });

  return value;
}
