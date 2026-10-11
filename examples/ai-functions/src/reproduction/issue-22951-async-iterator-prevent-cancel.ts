import type {
  Experimental_BatchV4 as BatchV4,
  Experimental_BatchV4ItemResult as BatchV4ItemResult,
} from '@ai-sdk/provider';
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { experimental_getBatchResults as getBatchResults } from 'ai';

type IteratorOptions = {
  preventCancel?: boolean;
};

type IteratorFactory<T> = (
  options?: IteratorOptions,
) => AsyncIterator<T, undefined, undefined>;

const batchItems = [
  {
    type: 'text',
    id: 'one',
    status: 'failed',
    error: { message: 'synthetic item failure' },
  },
  {
    type: 'text',
    id: 'two',
    status: 'failed',
    error: { message: 'synthetic item failure' },
  },
] satisfies BatchV4ItemResult[];

const provider: BatchV4 = {
  specificationVersion: 'v4',
  provider: 'mock.batch',
  supportedUrls: {},
  doStartBatch() {
    throw new Error('unused');
  },
  doGetBatchStatus() {
    throw new Error('unused');
  },
  async doGetBatchResults() {
    return new ReadableStream<BatchV4ItemResult>({
      start(controller) {
        for (const item of batchItems) {
          controller.enqueue(item);
        }
        controller.close();
      },
    });
  },
};

function makeStream() {
  return getBatchResults({
    provider,
    batch: { version: 2, id: 'batch', provider: 'mock.batch' },
    maxRetries: 0,
  });
}

async function readAfterEarlyReturn({
  entryPoint,
  options,
}: {
  entryPoint: 'values' | 'asyncIterator';
  options?: IteratorOptions;
}) {
  const stream = makeStream();
  const iterator =
    entryPoint === 'values'
      ? stream.values(options)
      : (
          stream[Symbol.asyncIterator] as IteratorFactory<
            (typeof batchItems)[number]
          >
        ).call(stream, options);

  const first = await iterator.next();
  assert.equal(first.done, false, `${entryPoint}: first item was missing`);
  assert.equal(first.value.id, 'one', `${entryPoint}: wrong first item`);
  assert.ok(iterator.return, `${entryPoint}: iterator has no return method`);
  await iterator.return();

  const reader = stream.getReader();
  const next = await reader.read();
  await reader.cancel();
  reader.releaseLock();

  return { done: next.done, id: next.value?.id };
}

async function main() {
  const nativeValues = await readAfterEarlyReturn({
    entryPoint: 'values',
    options: { preventCancel: true },
  });
  assert.deepEqual(nativeValues, { done: false, id: 'two' });

  const defaultIterator = await readAfterEarlyReturn({
    entryPoint: 'asyncIterator',
  });
  assert.deepEqual(defaultIterator, { done: true, id: undefined });

  const explicitCancelIterator = await readAfterEarlyReturn({
    entryPoint: 'asyncIterator',
    options: { preventCancel: false },
  });
  assert.deepEqual(explicitCancelIterator, { done: true, id: undefined });

  const preventCancelIterator = await readAfterEarlyReturn({
    entryPoint: 'asyncIterator',
    options: { preventCancel: true },
  });

  if (!isDeepStrictEqual(preventCancelIterator, nativeValues)) {
    console.error(
      'ISSUE_22951: preventCancel=true discarded the unread batch result',
    );
    console.error({ nativeValues, preventCancelIterator });
    process.exitCode = 1;
    return;
  }

  assert.deepEqual(preventCancelIterator, nativeValues);
  console.log('Issue #22951 did not reproduce.');
}

main().catch(error => {
  console.error('REPRODUCTION_HARNESS_ERROR', error);
  process.exitCode = 2;
});
