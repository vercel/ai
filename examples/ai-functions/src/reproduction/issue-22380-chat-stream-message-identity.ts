import assert from 'node:assert/strict';
import {
  AbstractChat,
  type ChatState,
  type ChatStatus,
  type ChatTransport,
  type UIMessage,
  type UIMessageChunk,
} from 'ai';

class ReproductionState implements ChatState<UIMessage> {
  status: ChatStatus = 'ready';
  error: Error | undefined;
  messages: UIMessage[];

  constructor(messages: UIMessage[] = []) {
    this.messages = messages;
  }

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

function finishTextStream(
  controller: ReadableStreamDefaultController<UIMessageChunk>,
  id: string,
  delta: string,
) {
  controller.enqueue({ type: 'text-delta', id, delta });
  controller.enqueue({ type: 'text-end', id });
  controller.enqueue({ type: 'finish' });
  controller.close();
}

async function reproduceDuplicateAfterAppendingMessage() {
  const controlled = createControlledTransport();
  let nextId = 0;
  const chat = new ReproductionChat({
    state: new ReproductionState(),
    transport: controlled.transport,
    generateId: () => `generated-${nextId++}`,
  });

  const done = chat.sendMessage({ text: 'first question' });
  await waitFor(() => chat.status === 'submitted', 'the first request');

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

  finishTextStream(controlled.controller, 'text-1', 'lo');
  await done;

  return chat.messages;
}

async function reproduceOverwriteAfterIndexShift() {
  const controlled = createControlledTransport();
  const chat = new ReproductionChat({
    state: new ReproductionState([
      {
        id: 'user-before',
        role: 'user',
        parts: [{ type: 'text', text: 'Run the approved tool.' }],
      },
      {
        id: 'assistant-1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-weather',
            toolCallId: 'call-1',
            state: 'approval-responded',
            input: { city: 'Tokyo' },
            approval: { id: 'approval-1', approved: true },
          },
        ],
      } as UIMessage,
      {
        id: 'user-later',
        role: 'user',
        parts: [{ type: 'text', text: 'Keep this message.' }],
      },
      {
        id: 'assistant-later',
        role: 'assistant',
        parts: [{ type: 'text', text: 'This is a later response.' }],
      },
    ]),
    transport: controlled.transport,
    generateId: () => 'unused-generated-id',
  });

  const done = chat.sendMessage();
  await waitFor(() => chat.status === 'submitted', 'the continuation request');

  controlled.controller.enqueue({ type: 'text-start', id: 'text-2' });
  controlled.controller.enqueue({
    type: 'text-delta',
    id: 'text-2',
    delta: 'Hel',
  });
  await waitFor(
    () =>
      text(chat.messages.find(message => message.id === 'assistant-1')) ===
      'Hel',
    'the partial earlier-assistant continuation',
  );

  chat.messages = chat.messages.filter(message => message.id !== 'user-before');

  finishTextStream(controlled.controller, 'text-2', 'lo');
  await done;

  return chat.messages;
}

function duplicateSymptom(messages: UIMessage[]) {
  const replies = messages.filter(message => message.id === 'reply-1');
  return (
    replies.length === 2 &&
    replies.some(message => text(message) === 'Hel') &&
    replies.some(message => text(message) === 'Hello')
  );
}

function duplicateScenarioIsCorrect(messages: UIMessage[]) {
  const replies = messages.filter(message => message.id === 'reply-1');
  return (
    replies.length === 1 &&
    text(replies[0]) === 'Hello' &&
    messages[1]?.id === 'reply-1' &&
    messages[2]?.id === 'user-2'
  );
}

function overwriteSymptom(messages: UIMessage[]) {
  const continuedMessages = messages.filter(
    message => message.id === 'assistant-1',
  );
  return (
    !messages.some(message => message.id === 'user-later') &&
    continuedMessages.length === 2 &&
    continuedMessages.some(message => text(message) === 'Hel') &&
    continuedMessages.some(message => text(message) === 'Hello')
  );
}

function overwriteScenarioIsCorrect(messages: UIMessage[]) {
  const continuedMessages = messages.filter(
    message => message.id === 'assistant-1',
  );
  return (
    continuedMessages.length === 1 &&
    text(continuedMessages[0]) === 'Hello' &&
    messages[0]?.id === 'assistant-1' &&
    messages[1]?.id === 'user-later' &&
    messages[2]?.id === 'assistant-later'
  );
}

async function main() {
  const duplicateMessages = await reproduceDuplicateAfterAppendingMessage();
  const overwriteMessages = await reproduceOverwriteAfterIndexShift();
  const failures: string[] = [];

  if (duplicateSymptom(duplicateMessages)) {
    failures.push(
      'appending a user message froze a partial reply and appended a duplicate assistant message with the same id',
    );
  } else {
    assert.ok(
      duplicateScenarioIsCorrect(duplicateMessages),
      `Unexpected append scenario state: ${JSON.stringify(duplicateMessages)}`,
    );
  }

  if (overwriteSymptom(overwriteMessages)) {
    failures.push(
      'removing an earlier message made an earlier-assistant continuation overwrite a later user message at the captured index',
    );
  } else {
    assert.ok(
      overwriteScenarioIsCorrect(overwriteMessages),
      `Unexpected index-shift scenario state: ${JSON.stringify(overwriteMessages)}`,
    );
  }

  if (failures.length > 0) {
    console.error(
      'ISSUE_22380_REPRODUCED: streaming assistant updates target list positions instead of stable message ids\n' +
        failures.map(failure => `- ${failure}`).join('\n'),
    );
    process.exitCode = 1;
    return;
  }

  console.log('Issue #22380 did not reproduce.');
}

main().catch(error => {
  console.error('REPRODUCTION_HARNESS_ERROR', error);
  process.exitCode = 2;
});
