import { toUIMessageStream } from '@ai-sdk/langchain';
import type { AIMessageChunk } from '@langchain/core/messages';

const cancellationReason = 'consumer stopped';

async function main() {
  let returned = false;
  let aborted = 0;
  let resolveStarted!: () => void;
  let resolvePending!: (result: IteratorResult<AIMessageChunk, void>) => void;

  const started = new Promise<void>(resolve => {
    resolveStarted = resolve;
  });
  const pending = new Promise<IteratorResult<AIMessageChunk, void>>(resolve => {
    resolvePending = resolve;
  });
  const source: AsyncIterable<AIMessageChunk> &
    AsyncIterator<AIMessageChunk, void> = {
    [Symbol.asyncIterator]() {
      return this;
    },
    async next() {
      resolveStarted();
      return pending;
    },
    async return() {
      returned = true;
      resolvePending({ done: true, value: undefined });
      return { done: true, value: undefined };
    },
  };

  const output = toUIMessageStream(source, {
    onAbort: () => {
      aborted++;
    },
  });

  // The reported implementation starts reading eagerly. Do not require that
  // implementation detail: moving reads to pull() is also a valid fix.
  const nextStarted = await Promise.race([
    started.then(() => true),
    new Promise<false>(resolve => setImmediate(() => resolve(false))),
  ]);

  await output.cancel(cancellationReason);

  // cancel() resolves after cancellation is complete, so capture the state
  // before manually releasing the broken implementation's pending next().
  const returnedAfterCancel = returned;
  const abortedAfterCancel = aborted;

  if (!returned) {
    resolvePending({ done: true, value: undefined });
    await new Promise<void>(resolve => setImmediate(resolve));
  }

  const failures: string[] = [];
  if (nextStarted && !returnedAfterCancel) {
    failures.push('the pending source iterator was not closed with return()');
  }
  if (abortedAfterCancel !== 1) {
    failures.push(
      `onAbort was called ${abortedAfterCancel} times instead of once`,
    );
  }

  if (failures.length > 0) {
    console.error(
      'ISSUE_22783: cancellation was not propagated to the source iterator\n' +
        failures.map(failure => `- ${failure}`).join('\n'),
    );
    process.exitCode = 1;
    return;
  }

  console.log('Issue #22783 did not reproduce.');
}

main().catch(error => {
  console.error('REPRODUCTION_HARNESS_ERROR', error);
  process.exitCode = 2;
});
