import assert from 'node:assert/strict';
import { createUIMessageStream, type UIMessageChunk } from 'ai';

class ReproducedBugError extends Error {}

async function main() {
  let sourceCancelled = false;
  let sourceContinuedAfterConsumerCancel = false;

  let markPullStarted!: () => void;
  const pullStarted = new Promise<void>(resolve => {
    markPullStarted = resolve;
  });

  let releasePull!: () => void;
  const pullRelease = new Promise<void>(resolve => {
    releasePull = resolve;
  });

  let markPullFinished!: () => void;
  const pullFinished = new Promise<void>(resolve => {
    markPullFinished = resolve;
  });

  const source = new ReadableStream<UIMessageChunk>({
    start(controller) {
      controller.enqueue({ type: 'start' });
    },
    async pull(controller) {
      markPullStarted();
      await pullRelease;

      if (!sourceCancelled) {
        sourceContinuedAfterConsumerCancel = true;
        controller.enqueue({
          type: 'text-delta',
          id: 'continued-source',
          delta: 'discarded',
        });
        controller.close();
      }

      markPullFinished();
    },
    cancel() {
      sourceCancelled = true;
    },
  });

  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      writer.merge(source);
    },
  });

  const reader = stream.getReader();
  const firstRead = await reader.read();
  assert.equal(
    firstRead.done,
    false,
    'merged stream ended before cancellation',
  );
  assert.equal(firstRead.value.type, 'start', 'unexpected first merged chunk');

  // Ensure merge() has an outstanding read from the source before simulating
  // the response consumer disconnecting.
  await pullStarted;
  await reader.cancel('client disconnected');

  releasePull();
  await pullFinished;

  if (!sourceCancelled) {
    assert.equal(
      sourceContinuedAfterConsumerCancel,
      true,
      'uncancelled source did not resume its pending pull',
    );
    throw new ReproducedBugError(
      'ISSUE_21721: merged source was not cancelled after consumer cancellation',
    );
  }

  assert.equal(
    sourceContinuedAfterConsumerCancel,
    false,
    'merged source continued after being cancelled',
  );
  console.log('Issue #21721 did not reproduce.');
}

main().catch(error => {
  if (error instanceof ReproducedBugError) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }

  console.error('REPRODUCTION_HARNESS_ERROR', error);
  process.exitCode = 2;
});
