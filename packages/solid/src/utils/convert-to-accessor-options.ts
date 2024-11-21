import { Accessor, createMemo } from 'solid-js';

/**
 * Handle reactive and non-reactive useChatOptions
 */
export function convertToAccessorOptions<T extends object>(
  options: T | Accessor<T>,
) {
  const resolvedOptions = typeof options === 'function' ? options() : options;

  return Object.entries(resolvedOptions).reduce(
    (reactiveOptions, [key, value]) => {
      reactiveOptions[key as keyof T] = createMemo(() => value) as any;
      return reactiveOptions;
    },
    {} as {
      [K in keyof T]: Accessor<T[K]>;
    },
  );
}
