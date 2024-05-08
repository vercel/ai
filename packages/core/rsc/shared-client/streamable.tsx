import { startTransition, useLayoutEffect, useState } from 'react';
import { STREAMABLE_VALUE_TYPE } from '../constants';
import type { StreamableValue } from '../types';

function hasReadableValueSignature(value: unknown): value is StreamableValue {
  return !!(
    value &&
    typeof value === 'object' &&
    'type' in value &&
    value.type === STREAMABLE_VALUE_TYPE
  );
}

function assertStreamableValue(
  value: unknown,
): asserts value is StreamableValue {
  if (!hasReadableValueSignature(value)) {
    throw new Error(
      'Invalid value: this hook only accepts values created via `createStreamableValue`.',
    );
  }
}

function isStreamableValue(value: unknown): value is StreamableValue {
  const hasSignature = hasReadableValueSignature(value);

  if (!hasSignature && typeof value !== 'undefined') {
    throw new Error(
      'Invalid value: this hook only accepts values created via `createStreamableValue`.',
    );
  }

  return hasSignature;
}

/**
 * `readStreamableValue` takes a streamable value created via the `createStreamableValue().value` API,
 * and returns an async iterator.
 *
 * ```js
 * // Inside your AI action:
 *
 * async function action() {
 *   'use server'
 *   const streamable = createStreamableValue();
 *
 *   streamable.update(1);
 *   streamable.update(2);
 *   streamable.done(3);
 *   // ...
 *   return streamable.value;
 * }
 * ```
 *
 * And to read the value:
 *
 * ```js
 * const streamableValue = await action()
 * for await (const v of readStreamableValue(streamableValue)) {
 *   console.log(v)
 * }
 * ```
 *
 * This logs out 1, 2, 3 on console.
 */
export function readStreamableValue<T = unknown>(
  streamableValue: StreamableValue<T>,
): AsyncIterable<T | undefined> {
  assertStreamableValue(streamableValue);

  return {
    [Symbol.asyncIterator]() {
      let row: StreamableValue<T> | Promise<StreamableValue<T>> =
        streamableValue;
      let curr = row.curr;
      let done = false;
      let initial = true;

      return {
        async next() {
          if (done) return { value: curr, done: true };

          row = await row;

          if (typeof row.error !== 'undefined') {
            throw row.error;
          }
          if ('curr' in row || row.diff) {
            if (row.diff) {
              switch (row.diff[0]) {
                case 0:
                  if (typeof curr !== 'string') {
                    throw new Error(
                      'Invalid patch: can only append to string types. This is a bug in the AI SDK.',
                    );
                  } else {
                    (curr as string) = curr + row.diff[1];
                  }
                  break;
              }
            } else {
              curr = row.curr;
            }

            // The last emitted { done: true } won't be used as the value
            // by the for await...of syntax.
            if (!row.next) {
              done = true;
              return {
                value: curr,
                done: false,
              };
            }
          }

          if (!row.next) {
            return {
              value: curr,
              done: true,
            };
          }

          row = row.next;
          if (initial) {
            initial = false;
            if (typeof curr === 'undefined') {
              // This is the initial chunk and there isn't an initial value yet.
              // Let's skip this one.
              return this.next();
            }
          }

          return {
            value: curr,
            done: false,
          };
        },
      };
    },
  };
}

/**
 * `useStreamableValue` is a React hook that takes a streamable value created via the `createStreamableValue().value` API,
 * and returns the current value, error, and pending state.
 *
 * This is useful for consuming streamable values received from a component's props. For example:
 *
 * ```js
 * function MyComponent({ streamableValue }) {
 *   const [data, error, pending] = useStreamableValue(streamableValue);
 *
 *   if (pending) return <div>Loading...</div>;
 *   if (error) return <div>Error: {error.message}</div>;
 *
 *   return <div>Data: {data}</div>;
 * }
 * ```
 */
export function useStreamableValue<T = unknown, Error = unknown>(
  streamableValue?: StreamableValue<T>,
): [data: T | undefined, error: Error | undefined, pending: boolean] {
  const [curr, setCurr] = useState<T | undefined>(
    isStreamableValue(streamableValue) ? streamableValue.curr : undefined,
  );
  const [error, setError] = useState<Error | undefined>(
    isStreamableValue(streamableValue) ? streamableValue.error : undefined,
  );
  const [pending, setPending] = useState<boolean>(
    isStreamableValue(streamableValue) ? !!streamableValue.next : false,
  );

  useLayoutEffect(() => {
    if (!isStreamableValue(streamableValue)) return;

    let cancelled = false;

    const iterator = readStreamableValue(streamableValue);
    if (streamableValue.next) {
      startTransition(() => {
        if (cancelled) return;
        setPending(true);
      });
    }

    (async () => {
      try {
        for await (const value of iterator) {
          if (cancelled) return;
          startTransition(() => {
            if (cancelled) return;
            setCurr(value);
          });
        }
      } catch (e) {
        if (cancelled) return;
        startTransition(() => {
          if (cancelled) return;
          setError(e as Error);
        });
      } finally {
        if (cancelled) return;
        startTransition(() => {
          if (cancelled) return;
          setPending(false);
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [streamableValue]);

  return [curr, error, pending];
}
