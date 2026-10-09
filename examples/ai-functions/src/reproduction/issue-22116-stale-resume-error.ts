import assert from 'node:assert/strict';
import type { ChatTransport, UIMessage } from 'ai';
import { Chat } from '../../../../packages/react/dist/index.mjs';

async function main() {
  const reconnectErrors = [
    new Error('first reconnect failure'),
    new Error('second reconnect failure'),
  ];
  const observedErrors: string[] = [];

  const transport: ChatTransport<UIMessage> = {
    sendMessages: async () => {
      throw new Error('unexpected sendMessages call');
    },
    reconnectToStream: async () => {
      const error = reconnectErrors.shift();
      assert.ok(error, 'unexpected reconnectToStream call');
      throw error;
    },
  };

  const chat = new Chat<UIMessage>({
    id: 'issue-22116',
    transport,
    onError: error => observedErrors.push(error.message),
  });
  const subscriberErrors: string[] = [];
  chat['~registerErrorCallback'](() => {
    subscriberErrors.push(chat.error?.message ?? 'undefined');
  });

  await chat.resumeStream();
  await chat.resumeStream();

  assert.deepEqual(observedErrors, [
    'first reconnect failure',
    'second reconnect failure',
  ]);
  assert.equal(chat.status, 'error');

  const failures: string[] = [];

  try {
    assert.equal(chat.error?.message, 'second reconnect failure');
  } catch {
    failures.push(`chat.error is "${chat.error?.message}"`);
  }

  try {
    assert.deepEqual(subscriberErrors, [
      'first reconnect failure',
      'second reconnect failure',
    ]);
  } catch {
    failures.push(
      `React error subscriber observed ${JSON.stringify(subscriberErrors)}`,
    );
  }

  if (failures.length > 0) {
    throw new Error(
      `ISSUE #22116 REPRODUCED: latest reconnect failure was not published\n${failures.join('\n')}`,
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
