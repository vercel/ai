import assert from 'node:assert/strict';
import {
  AbstractChat,
  type ChatState,
  type ChatStatus,
  type ChatTransport,
  type UIMessage,
  type UIMessageChunk,
} from '../../../../packages/ai/src/index';

class ReproductionState implements ChatState<UIMessage> {
  status: ChatStatus = 'ready';
  error: Error | undefined;
  messages: UIMessage[] = [];

  pushMessage = (message: UIMessage) => {
    this.messages = this.messages.concat(message);
  };

  popMessage = () => {
    this.messages = this.messages.slice(0, -1);
  };

  replaceMessage = (index: number, message: UIMessage) => {
    this.messages = this.messages.map((current, currentIndex) =>
      currentIndex === index ? this.snapshot(message) : current,
    );
  };

  snapshot = <T>(value: T): T => structuredClone(value);
}

class ReproductionChat extends AbstractChat<UIMessage> {}

function createControlledTransport() {
  let controller: ReadableStreamDefaultController<UIMessageChunk> | undefined;

  const transport = {
    sendMessages: async () =>
      new ReadableStream<UIMessageChunk>({
        start(streamController) {
          controller = streamController;
        },
      }),
    reconnectToStream: async () => null,
  } satisfies ChatTransport<UIMessage>;

  return {
    transport,
    get controller() {
      assert.ok(controller, 'The response stream was not opened');
      return controller;
    },
  };
}

function text(message: UIMessage | undefined) {
  return (
    message?.parts
      .filter(part => part.type === 'text')
      .map(part => part.text)
      .join('') ?? ''
  );
}

async function waitFor(
  predicate: () => boolean,
  description: string,
  timeoutMs = 1_000,
) {
  const deadline = Date.now() + timeoutMs;

  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error(`Timed out waiting for ${description}`);
    }
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}

function hasReportedDuplicate(messages: UIMessage[]) {
  const replies = messages.filter(message => message.id === 'reply-1');

  return (
    replies.length === 2 &&
    replies.some(message => text(message) === 'Hel') &&
    replies.some(message => text(message) === 'Hello')
  );
}

function hasExpectedResult(messages: UIMessage[]) {
  const replies = messages.filter(message => message.id === 'reply-1');

  return (
    replies.length === 1 &&
    text(replies[0]) === 'Hello' &&
    messages[1]?.id === 'reply-1' &&
    messages[2]?.id === 'user-2'
  );
}

async function main() {
  const controlled = createControlledTransport();
  let nextId = 0;
  const chat = new ReproductionChat({
    state: new ReproductionState(),
    transport: controlled.transport,
    generateId: () => `generated-${nextId++}`,
  });

  const done = chat.sendMessage({ text: 'first question' });
  await waitFor(() => chat.status === 'submitted', 'the request to start');

  controlled.controller.enqueue({ type: 'start', messageId: 'reply-1' });
  controlled.controller.enqueue({ type: 'text-start', id: 'text-1' });
  controlled.controller.enqueue({
    type: 'text-delta',
    id: 'text-1',
    delta: 'Hel',
  });
  await waitFor(
    () =>
      text(chat.messages.find(message => message.id === 'reply-1')) === 'Hel',
    'the partial assistant response',
  );

  chat.messages = [
    ...chat.messages,
    {
      id: 'user-2',
      role: 'user',
      parts: [{ type: 'text', text: 'follow-up' }],
    },
  ];

  controlled.controller.enqueue({
    type: 'text-delta',
    id: 'text-1',
    delta: 'lo',
  });
  controlled.controller.enqueue({ type: 'text-end', id: 'text-1' });
  controlled.controller.enqueue({ type: 'finish' });
  controlled.controller.close();
  await done;

  if (hasReportedDuplicate(chat.messages)) {
    console.error(
      'ISSUE_22380_REPRODUCED: appending a user message during streaming left a frozen partial assistant reply and appended a completed duplicate with the same id',
    );
    process.exitCode = 1;
    return;
  }

  assert.ok(
    hasExpectedResult(chat.messages),
    `Unexpected final message state: ${JSON.stringify(chat.messages)}`,
  );
  console.log('Issue #22380 did not reproduce.');
}

main().catch(error => {
  console.error('REPRODUCTION_HARNESS_ERROR', error);
  process.exitCode = 2;
});
