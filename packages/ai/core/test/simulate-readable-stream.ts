import { delay as delayFunction } from '../../util/delay';

/**
 * Creates a ReadableStream that emits the provided values with an optional delay between each value.
 *
 * @param options - The configuration options
 * @param options.values - Array of values to be emitted by the stream
 * @param options.chunkDelayInMs - Optional delay in milliseconds between emitting each value (default: 0)
 * @returns A ReadableStream that emits the provided values
 */
export function simulateReadableStream<T>({
  values,
  initialDelayInMs = 0,
  chunkDelayInMs = 0,
  _internal,
}: {
  values: T[];
  initialDelayInMs?: number;
  chunkDelayInMs?: number;
  _internal?: {
    delay?: (ms: number) => Promise<void>;
  };
}): ReadableStream<T> {
  const delay = _internal?.delay ?? delayFunction;

  let index = 0;

  return new ReadableStream({
    async pull(controller) {
      if (index < values.length) {
        await delay(index === 0 ? initialDelayInMs : chunkDelayInMs);
        controller.enqueue(values[index++]);
      } else {
        controller.close();
      }
    },
  });
}
