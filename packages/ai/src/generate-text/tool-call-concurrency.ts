import { InvalidArgumentError } from '../error/invalid-argument-error';

/**
 * Validates the maximum number of tool calls that may execute concurrently.
 */
export function prepareToolCallConcurrency(
  toolCallConcurrency: number | undefined,
): number | undefined {
  if (toolCallConcurrency == null) {
    return undefined;
  }

  if (!Number.isInteger(toolCallConcurrency)) {
    throw new InvalidArgumentError({
      parameter: 'toolCallConcurrency',
      value: toolCallConcurrency,
      message: 'toolCallConcurrency must be an integer',
    });
  }

  if (toolCallConcurrency < 1) {
    throw new InvalidArgumentError({
      parameter: 'toolCallConcurrency',
      value: toolCallConcurrency,
      message: 'toolCallConcurrency must be >= 1',
    });
  }

  return toolCallConcurrency;
}

/**
 * Maps items with an optional concurrency limit while preserving result order.
 *
 * Workers claim items in input order. When the signal is aborted or an
 * execution rejects, no additional queued items are started.
 */
export async function mapWithConcurrency<INPUT, OUTPUT>({
  items,
  concurrency,
  abortSignal,
  execute,
}: {
  items: Array<INPUT>;
  concurrency: number | undefined;
  abortSignal?: AbortSignal;
  execute: (item: INPUT, index: number) => Promise<OUTPUT>;
}): Promise<Array<OUTPUT>> {
  if (concurrency == null || concurrency >= items.length) {
    return Promise.all(items.map(execute));
  }

  const results = new Array<OUTPUT>(items.length);
  let nextIndex = 0;
  let stopped = false;

  const worker = async () => {
    while (!stopped) {
      abortSignal?.throwIfAborted();

      const index = nextIndex++;
      if (index >= items.length) {
        return;
      }

      try {
        results[index] = await execute(items[index], index);
      } catch (error) {
        stopped = true;
        throw error;
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker),
  );

  return results;
}
