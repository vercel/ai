import assert from 'node:assert/strict';
import { Chat } from '../../../../packages/react/dist/index.mjs';

async function main() {
  const reconnectErrors = [
    new Error('first reconnect failure'),
    new Error('second reconnect failure'),
  ];
  const onErrorMessages: string[] = [];

  const chat = new Chat({
    id: 'issue-22116',
    messages: [],
    transport: {
      sendMessages: async () => {
        throw new Error('unexpected sendMessages call');
      },
      reconnectToStream: async () => {
        throw reconnectErrors.shift();
      },
    },
    onError: error => {
      onErrorMessages.push(error.message);
    },
  });

  const subscriberErrorMessages: Array<string | undefined> = [];
  const unregister = chat['~registerErrorCallback'](() => {
    subscriberErrorMessages.push(chat.error?.message);
  });

  await chat.resumeStream();
  await chat.resumeStream();
  unregister();

  const observed = {
    onErrorMessages,
    status: chat.status,
    error: chat.error?.message,
    subscriberErrorMessages,
  };
  console.log(JSON.stringify(observed, null, 2));

  assert.deepEqual(onErrorMessages, [
    'first reconnect failure',
    'second reconnect failure',
  ]);
  assert.equal(chat.status, 'error');
  assert.equal(
    chat.error?.message,
    'second reconnect failure',
    `STALE_CHAT_ERROR: expected latest reconnect failure, got ${JSON.stringify(
      chat.error?.message,
    )}`,
  );
  assert.equal(
    subscriberErrorMessages.at(-1),
    'second reconnect failure',
    'React error subscriber did not receive the latest reconnect failure',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
