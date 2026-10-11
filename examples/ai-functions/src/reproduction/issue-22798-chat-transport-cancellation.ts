import assert from 'node:assert/strict';
import { DefaultChatTransport } from 'ai';

const bugSignal =
  'ISSUE_22798: cancellation did not settle promptly or fetch started after abort';

async function main() {
  let releasePreparation!: () => void;
  let markPreparationStarted!: () => void;

  const preparationPending = new Promise<void>(resolve => {
    releasePreparation = resolve;
  });
  const preparationStarted = new Promise<void>(resolve => {
    markPreparationStarted = resolve;
  });

  let fetches = 0;
  const transport = new DefaultChatTransport({
    prepareSendMessagesRequest: async () => {
      markPreparationStarted();
      await preparationPending;
      return { body: {} };
    },
    fetch: async (_url, init) => {
      fetches++;
      init?.signal?.throwIfAborted();
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.close();
          },
        }),
      );
    },
  });

  const controller = new AbortController();
  const abortReason = new Error('user stopped');
  let settled = false;
  let rejection: unknown;

  const request = transport.sendMessages({
    trigger: 'submit-message',
    chatId: 'chat1',
    messageId: undefined,
    messages: [],
    abortSignal: controller.signal,
  });
  const observed = request.then(
    () => {
      settled = true;
    },
    error => {
      settled = true;
      rejection = error;
    },
  );

  await preparationStarted;
  controller.abort(abortReason);
  await new Promise<void>(resolve => setImmediate(resolve));
  const settledBeforePreparationRelease = settled;

  releasePreparation();
  await observed;
  await new Promise<void>(resolve => setImmediate(resolve));

  assert.equal(
    rejection,
    abortReason,
    'cancellation must reject with the original abort reason',
  );

  if (!settledBeforePreparationRelease || fetches !== 0) {
    console.error(bugSignal);
    console.error(JSON.stringify({ settledBeforePreparationRelease, fetches }));
    process.exitCode = 1;
    return;
  }

  console.log('Issue #22798 did not reproduce.');
}

main().catch(error => {
  console.error('REPRODUCTION_HARNESS_ERROR', error);
  process.exitCode = 2;
});
