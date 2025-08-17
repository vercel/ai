import { Accessor, createSignal, onCleanup, onMount } from "solid-js";
import { createStore } from "solid-js/store";

export function useSyncSignalCallback<T>(name: string, initialValue: T, callback: (value: () => void) => (() => void), getValue: () => T): Accessor<T> {
  const [value, setValue] = createSignal<T>(initialValue, {
    name,
  });
  let dispose: () => void;
  onMount(() => {
    dispose = callback(() => {
      const nv = getValue();
      setValue(() => nv);
    });
  });

  onCleanup(() => {
    dispose?.();
  });

  return value;
}

export function useSyncStoreCallback<T extends object>(initialValue: T, callback: (value: () => void) => (() => void), getValue: () => T): T {
  const [value, setValue] = createStore<T>(initialValue);
  let dispose: () => void;
  onMount(() => {
    dispose = callback(() => {
      const nv = getValue();

      setValue(nv);
    });
  });

  onCleanup(() => {
    dispose?.();
  });

  return value;
}