import type { UIMessage, UIMessageChunk } from 'ai';
import { Chat } from '../../../../packages/react/dist/index.mjs';

const failureSignal =
  'ISSUE_13962_REPRODUCED: await chat.stop() resolved while chat.status was still "streaming"';

function createDeferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

async function withTimeout<T>(
  promise: Promise<T>,
  description: string,
): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`Timed out waiting for ${description}`)),
          5_000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  const toolCallStarted = createDeferred();
  const releaseToolCall = createDeferred();
  let abortObserved = false;
  let sendCount = 0;
  let id = 0;

  const chat = new Chat<UIMessage>({
    generateId: () => `id-${id++}`,
    transport: {
      sendMessages: async ({ abortSignal }) => {
        sendCount++;
        abortSignal?.addEventListener(
          'abort',
          () => {
            abortObserved = true;
          },
          { once: true },
        );

        return new ReadableStream<UIMessageChunk>({
          start(controller) {
            controller.enqueue({ type: 'start' });
            controller.enqueue({ type: 'start-step' });
            controller.enqueue({
              type: 'tool-input-available',
              toolCallId: 'tool-call-1',
              toolName: 'slow-tool',
              input: {},
            });

            // These chunks are buffered behind the blocking tool callback when
            // stop() is called.
            controller.enqueue({ type: 'text-start', id: 'after-stop' });
            controller.enqueue({
              type: 'text-delta',
              id: 'after-stop',
              delta: 'AFTER_STOP',
            });
          },
        });
      },
      reconnectToStream: async () => null,
    },
    onToolCall: async () => {
      toolCallStarted.resolve();
      await releaseToolCall.promise;
    },
  });

  const requestPromise = chat.sendMessage({ text: 'Run the slow tool' });
  await withTimeout(toolCallStarted.promise, 'the tool callback to start');

  if (chat.status !== 'streaming') {
    throw new Error(
      `Invalid reproduction setup: expected streaming before stop, received ${chat.status}`,
    );
  }

  await chat.stop();
  const statusAfterAwaitedStop: string = chat.status;

  // This models the issue's clear-chat flow immediately after awaiting stop().
  chat.messages = [];

  releaseToolCall.resolve();
  await withTimeout(requestPromise, 'the aborted request pipeline to settle');
  await new Promise(resolve => setTimeout(resolve, 0));

  const result = {
    abortObserved,
    finalMessageCount: chat.messages.length,
    finalStatus: chat.status,
    sendCount,
    statusAfterAwaitedStop,
  };
  console.log(JSON.stringify(result));

  if (!abortObserved) {
    throw new Error('Invalid reproduction setup: abort signal was not fired');
  }

  if (statusAfterAwaitedStop === 'streaming') {
    throw new Error(failureSignal);
  }

  if (chat.messages.length !== 0) {
    throw new Error(
      'Postcondition failed: messages were repopulated after awaited stop and clear',
    );
  }

  if (sendCount !== 1) {
    throw new Error(
      `Postcondition failed: the cancelled request was retried ${sendCount - 1} time(s)`,
    );
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
