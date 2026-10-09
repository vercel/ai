import type { UIMessage, UIMessageChunk } from 'ai';
import { Chat } from '../../../../packages/react/dist/index.js';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(resolvePromise => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function main() {
  const callbackStarted = deferred();
  const callbackReturned = deferred();

  let chat!: Chat<UIMessage>;
  chat = new Chat({
    id: 'issue-22354-reproduction',
    transport: {
      sendMessages: async () =>
        new ReadableStream<UIMessageChunk>({
          start(controller) {
            controller.enqueue({ type: 'start' });
            controller.enqueue({ type: 'start-step' });
            controller.enqueue({
              type: 'tool-input-available',
              toolCallId: 'tool-call-0',
              toolName: 'test-tool',
              input: { value: 'test' },
            });
          },
        }),
      reconnectToStream: async () => null,
    },
    onToolCall: async () => {
      callbackStarted.resolve();
      await chat.stop();
      callbackReturned.resolve();
    },
  });

  const sendMessagePromise = chat.sendMessage({ text: 'Hello' });
  await callbackStarted.promise;

  const outcome = await Promise.race([
    callbackReturned.promise.then(() => 'returned' as const),
    new Promise<'timed-out'>(resolve =>
      setTimeout(() => resolve('timed-out'), 500),
    ),
  ]);

  if (outcome === 'timed-out') {
    console.error(
      `ISSUE_22354_REPRODUCED: chat.stop() did not settle inside onToolCall; status=${chat.status}`,
    );
    process.exitCode = 1;
    return;
  }

  await sendMessagePromise;
  console.log(
    `ISSUE_22354_NOT_REPRODUCED: chat.stop() settled inside onToolCall; status=${chat.status}`,
  );
}

await main();
