import { simulateReadableStream } from 'ai';
import assert from 'node:assert/strict';

const delayInMs = 60_000;

function countTimeoutResources() {
  return process
    .getActiveResourcesInfo()
    .filter(resource => resource === 'Timeout').length;
}

async function main() {
  const before = countTimeoutResources();

  const initialDelayReader = simulateReadableStream({
    chunks: ['initial'],
    initialDelayInMs: delayInMs,
  }).getReader();
  const initialDelayRead = initialDelayReader.read();

  const chunkDelayReader = simulateReadableStream({
    chunks: ['first', 'second'],
    initialDelayInMs: null,
    chunkDelayInMs: delayInMs,
  }).getReader();
  assert.deepEqual(await chunkDelayReader.read(), {
    done: false,
    value: 'first',
  });
  const chunkDelayRead = chunkDelayReader.read();

  await new Promise<void>(resolve => setImmediate(resolve));

  const whilePending = countTimeoutResources();
  assert.ok(
    whilePending >= before + 2,
    `Expected both simulation delays to be pending; before=${before}, whilePending=${whilePending}`,
  );

  await Promise.all([initialDelayReader.cancel(), chunkDelayReader.cancel()]);
  await Promise.all([initialDelayRead, chunkDelayRead]);
  initialDelayReader.releaseLock();
  chunkDelayReader.releaseLock();

  const after = countTimeoutResources();
  console.log({ before, whilePending, after });

  if (after !== before) {
    throw new Error(
      'ISSUE_22652_REPRODUCED: cancellation left pending delay timer(s)',
    );
  }
}

await main();
