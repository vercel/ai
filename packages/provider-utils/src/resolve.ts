import type { MaybePromiseLike } from './maybe-promise-like';

/**
 * A value or a lazy provider of a value, each of which may be synchronous or asynchronous.
 *
 * @template T The resolved type after {@link resolve} runs.
 *
 * One of:
 * - A plain value of type {@link T}
 * - A {@link PromiseLike} of {@link T} (e.g. a `Promise<T>`)
 * - A zero-argument function that returns a plain {@link T}
 * - A zero-argument function that returns a {@link PromiseLike} of {@link T}
 *
 * The function form is only invoked when passed to {@link resolve}; it is not distinguished from
 * a {@link T} that happens to be a function—callers should wrap function values if disambiguation
 * is required.
 */
export type Resolvable<T> = MaybePromiseLike<T> | (() => MaybePromiseLike<T>);

/**
 * Resolves a value that could be a raw value, a Promise, a function returning a value,
 * or a function returning a Promise.
 */
export async function resolve<T>(value: Resolvable<T>): Promise<T> {
  // If it's a function, call it to get the value/promise
  if (typeof value === 'function') {
    value = (value as Function)();
  }

  // Otherwise just resolve whatever we got (value or promise)
  return value as T;
}

/**
 * Resolves and transforms a value, preserving synchronous results. This allows
 * synchronous credentials to remain usable by workflow serialization while
 * asynchronous credentials are awaited by request handlers.
 */
export function resolveWith<T, U>(
  value: Resolvable<T>,
  transform: (value: T) => U,
): U | Promise<Awaited<U>> {
  const resolved =
    typeof value === 'function'
      ? (value as () => MaybePromiseLike<T>)()
      : value;

  if (
    resolved != null &&
    (typeof resolved === 'object' || typeof resolved === 'function') &&
    typeof (resolved as PromiseLike<T>).then === 'function'
  ) {
    return Promise.resolve(resolved).then(transform) as Promise<Awaited<U>>;
  }

  return transform(resolved as T);
}
