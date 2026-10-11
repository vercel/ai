import assert from 'node:assert/strict';
import { createJustBashSandboxSessionFromNativeSandbox } from '@ai-sdk/sandbox-just-bash';

const delay = (ms: number) =>
  new Promise<void>(resolve => setTimeout(resolve, ms));

async function main() {
  let writes = 0;
  const session = createJustBashSandboxSessionFromNativeSandbox({
    bashEnvInstance: {
      getCwd: () => '/',
      fs: {
        writeFile: async () => {
          writes++;
        },
      },
    },
  } as never);

  const abortController = new AbortController();
  const abortReason = new DOMException('Cancelled write', 'AbortError');
  let inputController!: ReadableStreamDefaultController<Uint8Array>;
  let cancelled = false;
  let settled = false;
  let caught: unknown;

  const content = new ReadableStream<Uint8Array>({
    start(controller) {
      inputController = controller;
      controller.enqueue(new Uint8Array([1]));
    },
    cancel() {
      cancelled = true;
    },
  });

  const pending = Promise.resolve(
    session.writeFile({
      path: '/example.bin',
      content,
      abortSignal: abortController.signal,
    }),
  )
    .catch(error => {
      caught = error;
    })
    .finally(() => {
      settled = true;
    });

  await delay(10);
  abortController.abort(abortReason);
  await delay(100);

  const afterAbort = {
    settled,
    cancelled,
    writes,
    sameReason: caught === abortReason,
    locked: content.locked,
  };
  console.log(JSON.stringify({ afterAbort }));

  // Close the synthetic source so this reproduction always terminates on the
  // broken implementation.
  if (!cancelled) {
    inputController.close();
  }
  await pending;
  const afterSourceClosed = {
    settled,
    writes,
    sameReason: caught === abortReason,
    locked: content.locked,
  };
  console.log(JSON.stringify({ afterSourceClosed }));

  try {
    assert.equal(
      afterAbort.settled,
      true,
      'writeFile should reject without waiting for the input stream to close',
    );
    assert.equal(
      afterAbort.cancelled,
      true,
      'writeFile should cancel the input stream when aborted',
    );
    assert.equal(
      afterSourceClosed.sameReason,
      true,
      'writeFile should reject with the supplied abort reason',
    );
    assert.equal(
      afterSourceClosed.locked,
      false,
      'writeFile should release the input stream reader lock when aborted',
    );
    assert.equal(
      afterAbort.writes,
      0,
      'writeFile should not write after abort',
    );
  } catch {
    throw new Error(
      'ISSUE #22973 REPRODUCED: writeFile remained pending after abort while the input stream stayed open',
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
