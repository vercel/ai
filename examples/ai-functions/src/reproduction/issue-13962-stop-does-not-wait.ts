import { Chat } from '../../../../packages/react/src';
import type {
  ChatTransport,
  UIMessage,
  UIMessageChunk,
} from '../../../../packages/ai/src';

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function waitFor(predicate: () => boolean) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (predicate()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  throw new Error('HARNESS_FAILURE: chat never started streaming');
}

async function main() {
  const cancelStarted = deferred();
  const allowCancelToFinish = deferred();

  const responseStream = new ReadableStream<UIMessageChunk>({
    start(controller) {
      controller.enqueue({ type: 'start' });
      controller.enqueue({ type: 'start-step' });
      controller.enqueue({ type: 'text-start', id: 'text-1' });
      controller.enqueue({
        type: 'text-delta',
        id: 'text-1',
        delta: 'BEFORE_STOP',
      });
    },
    cancel() {
      cancelStarted.resolve();
      return allowCancelToFinish.promise;
    },
  });

  const transport: ChatTransport<UIMessage> = {
    sendMessages: async () => responseStream,
    reconnectToStream: async () => null,
  };

  let nextId = 0;
  const chat = new Chat<UIMessage>({
    id: 'issue-13962',
    generateId: () => `id-${nextId++}`,
    transport,
  });

  const sendPromise = chat.sendMessage({ text: 'start' });

  await waitFor(
    () =>
      chat.status === 'streaming' &&
      chat.messages.some(message =>
        message.parts.some(
          part => part.type === 'text' && part.text === 'BEFORE_STOP',
        ),
      ),
  );

  let stopResolved = false;
  const stopPromise = chat.stop().then(() => {
    stopResolved = true;
  });

  // A fixed stop() may wait for stream cancellation, so inspect the current
  // promise state before allowing cancellation to complete.
  await Promise.resolve();
  await Promise.resolve();

  const stopReturnedBeforePipeline = stopResolved;
  const statusWhenStopReturned = stopReturnedBeforePipeline
    ? chat.status
    : undefined;

  if (stopReturnedBeforePipeline) {
    chat.messages = [];
  }

  await cancelStarted.promise;
  allowCancelToFinish.resolve();
  await Promise.all([stopPromise, sendPromise]);

  if (!stopReturnedBeforePipeline) {
    chat.messages = [];
  }

  await new Promise(resolve => setTimeout(resolve, 0));

  if (chat.messages.length !== 0) {
    throw new Error(
      'ISSUE_13962_LATE_WRITE: messages were repopulated after stop and clear',
    );
  }

  if (
    statusWhenStopReturned === 'streaming' ||
    statusWhenStopReturned === 'submitted'
  ) {
    throw new Error(
      `ISSUE_13962_REPRODUCED: await chat.stop() returned while chat.status was "${statusWhenStopReturned}"`,
    );
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
