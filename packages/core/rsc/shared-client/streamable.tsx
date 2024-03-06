import { STREAMABLE_VALUE_TYPE } from '../constants';
import type { StreamableValue } from '../types';

function assertStreamableValue(
  value: unknown,
): asserts value is StreamableValue {
  if (
    !value ||
    typeof value !== 'object' ||
    !('type' in value) ||
    value.type !== STREAMABLE_VALUE_TYPE
  ) {
    throw new Error(
      'Invalid value: this hook only accepts values created via `createValueStream` from the server.',
    );
  }
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

      return {
        async next() {
          if (done) return { value: curr, done: true };

          row = await row;

          if (typeof row.error !== 'undefined') {
            throw row.error;
          }
          if ('curr' in row) {
            curr = row.curr;

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
          return {
            value: curr,
            done: false,
          };
        },
      };
    },
  };
}
