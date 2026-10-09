import { Chat } from '@ai-sdk/react';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(resolvePromise => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function outcomeWithin(
  promise: Promise<void>,
  timeoutMs = 500,
): Promise<'returned' | 'timed out'> {
  return Promise.race([
    promise.then(() => 'returned' as const),
    new Promise<'timed out'>(resolve =>
      setTimeout(() => resolve('timed out'), timeoutMs),
    ),
  ]);
}

async function reproduceOnToolCall() {
  const callbackStarted = deferred();
  const callbackReturned = deferred();
  let chat!: Chat<any>;

  chat = new Chat<any>({
    id: 'on-tool-call',
    transport: {
      sendMessages: async () =>
        new ReadableStream({
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

  const sendPromise = chat.sendMessage({ text: 'Hello' });
  await callbackStarted.promise;
  const outcome = await outcomeWithin(callbackReturned.promise);

  if (outcome === 'returned') {
    await sendPromise;
  }

  return { outcome, status: chat.status };
}

async function reproduceSendAutomaticallyWhen() {
  const callbackStarted = deferred();
  const callbackReturned = deferred();
  let chat!: Chat<any>;

  chat = new Chat<any>({
    id: 'send-automatically-when',
    messages: [
      {
        id: 'assistant-0',
        role: 'assistant',
        parts: [
          {
            type: 'tool-test-tool',
            toolCallId: 'tool-call-0',
            state: 'input-available',
            input: { value: 'test' },
          },
        ],
      },
    ],
    transport: {
      sendMessages: async () => {
        throw new Error('unexpected automatic request');
      },
      reconnectToStream: async () => null,
    },
    sendAutomaticallyWhen: async () => {
      callbackStarted.resolve();
      await chat.stop();
      callbackReturned.resolve();
      return false;
    },
  });

  const addToolOutputPromise = chat.addToolOutput({
    tool: 'test-tool',
    toolCallId: 'tool-call-0',
    output: { value: 'result' },
  });

  await callbackStarted.promise;
  const outcome = await outcomeWithin(callbackReturned.promise);

  if (outcome === 'returned') {
    await addToolOutputPromise;
  }

  return { outcome, status: chat.status };
}

async function main() {
  const onToolCall = await reproduceOnToolCall();
  const sendAutomaticallyWhen = await reproduceSendAutomaticallyWhen();

  console.log(JSON.stringify({ onToolCall, sendAutomaticallyWhen }, null, 2));

  if (
    onToolCall.outcome !== 'returned' ||
    sendAutomaticallyWhen.outcome !== 'returned'
  ) {
    console.error(
      'ISSUE_22354_REPRODUCED: awaited chat.stop() did not settle from a chat processing callback',
    );
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 2;
});
