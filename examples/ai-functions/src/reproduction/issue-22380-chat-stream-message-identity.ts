import { deepStrictEqual } from 'node:assert/strict';
import {
  AbstractChat,
  type ChatState,
  type ChatStatus,
  type ChatTransport,
  type UIMessage,
  type UIMessageChunk,
  isToolUIPart,
} from 'ai';

const failureSignal =
  'ISSUE_22380_REPRODUCED: streaming assistant identity was not preserved';

class SnapshotChatState implements ChatState<UIMessage> {
  status: ChatStatus = 'ready';
  error: Error | undefined;

  constructor(public messages: UIMessage[] = []) {}

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

class TestChat extends AbstractChat<UIMessage> {}

function createControlledChat(initialMessages: UIMessage[] = []) {
  let controller: ReadableStreamDefaultController<UIMessageChunk> | undefined;

  const transport: ChatTransport<UIMessage> = {
    sendMessages: async () =>
      new ReadableStream<UIMessageChunk>({
        start(streamController) {
          controller = streamController;
        },
      }),
    reconnectToStream: async () => null,
  };

  const chat = new TestChat({
    id: 'issue-22380',
    generateId: () => 'generated-user-message',
    state: new SnapshotChatState(initialMessages),
    transport,
  });

  return {
    chat,
    getController() {
      if (controller == null) {
        throw new Error('The response stream has not started.');
      }
      return controller;
    },
  };
}

async function waitFor(condition: () => boolean) {
  const deadline = Date.now() + 2_000;

  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error('Timed out waiting for a streaming chat update.');
    }
    await new Promise(resolve => setTimeout(resolve, 1));
  }
}

function text(message: UIMessage) {
  return message.parts
    .filter(part => part.type === 'text')
    .map(part => part.text)
    .join('');
}

function textSummary(messages: UIMessage[]) {
  return messages.map(message => ({
    id: message.id,
    role: message.role,
    text: text(message),
  }));
}

function continuationSummary(messages: UIMessage[]) {
  return messages.map(message => ({
    id: message.id,
    role: message.role,
    text: text(message),
    toolStates: message.parts
      .filter(isToolUIPart)
      .map(part => `${part.toolCallId}:${part.state}`),
  }));
}

async function reproduceDuplicateAfterAppendingMessage() {
  const { chat, getController } = createControlledChat();
  const done = chat.sendMessage({ text: 'first question' });

  await waitFor(() => chat.status === 'submitted');
  const controller = getController();
  controller.enqueue({ type: 'start', messageId: 'reply-1' });
  controller.enqueue({ type: 'text-start', id: 't1' });
  controller.enqueue({ type: 'text-delta', id: 't1', delta: 'Hel' });

  await waitFor(() =>
    chat.messages.some(
      message => message.id === 'reply-1' && text(message) === 'Hel',
    ),
  );

  chat.messages = [
    ...chat.messages,
    {
      id: 'user-2',
      role: 'user',
      parts: [{ type: 'text', text: 'follow-up' }],
    },
  ];

  controller.enqueue({ type: 'text-delta', id: 't1', delta: 'lo' });
  controller.enqueue({ type: 'text-end', id: 't1' });
  controller.enqueue({ type: 'finish', finishReason: 'stop' });
  controller.close();
  await done;

  return textSummary(chat.messages);
}

async function reproduceShiftedEarlierAssistantIndex() {
  const initialMessages: UIMessage[] = [
    {
      id: 'user-before',
      role: 'user',
      parts: [{ type: 'text', text: 'weather question' }],
    },
    {
      id: 'assistant-earlier',
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
    },
    {
      id: 'user-later',
      role: 'user',
      parts: [{ type: 'text', text: 'later question' }],
    },
    {
      id: 'assistant-later',
      role: 'assistant',
      parts: [{ type: 'text', text: 'later answer' }],
    },
  ];
  const { chat, getController } = createControlledChat(initialMessages);
  const done = chat.sendMessage();

  await waitFor(() => chat.status === 'submitted');
  const controller = getController();
  controller.enqueue({ type: 'start', messageId: 'continued-reply' });

  await waitFor(() => chat.messages[1]?.id === 'continued-reply');

  // Delete the message before the assistant response while it is streaming.
  chat.messages = chat.messages.slice(1);

  controller.enqueue({
    type: 'tool-output-available',
    toolCallId: 'call-1',
    output: { temperature: 72 },
  });
  controller.enqueue({ type: 'finish', finishReason: 'stop' });
  controller.close();
  await done;

  return continuationSummary(chat.messages);
}

async function main() {
  const appendedMessageActual = await reproduceDuplicateAfterAppendingMessage();
  const shiftedIndexActual = await reproduceShiftedEarlierAssistantIndex();

  const appendedMessageExpected = [
    {
      id: 'generated-user-message',
      role: 'user',
      text: 'first question',
    },
    { id: 'reply-1', role: 'assistant', text: 'Hello' },
    { id: 'user-2', role: 'user', text: 'follow-up' },
  ];
  const shiftedIndexExpected = [
    {
      id: 'continued-reply',
      role: 'assistant',
      text: '',
      toolStates: ['call-1:output-available'],
    },
    {
      id: 'user-later',
      role: 'user',
      text: 'later question',
      toolStates: [],
    },
    {
      id: 'assistant-later',
      role: 'assistant',
      text: 'later answer',
      toolStates: [],
    },
  ];

  console.log(
    'Appending during stream:',
    JSON.stringify(appendedMessageActual),
  );
  console.log(
    'Deleting before continued response:',
    JSON.stringify(shiftedIndexActual),
  );

  let appendedMessageMismatch: unknown;
  let shiftedIndexMismatch: unknown;

  try {
    deepStrictEqual(appendedMessageActual, appendedMessageExpected);
  } catch (error) {
    appendedMessageMismatch = error;
  }

  try {
    deepStrictEqual(shiftedIndexActual, shiftedIndexExpected);
  } catch (error) {
    shiftedIndexMismatch = error;
  }

  const duplicateReplyObserved =
    appendedMessageActual.filter(message => message.id === 'reply-1').length ===
      2 &&
    appendedMessageActual.some(
      message => message.id === 'reply-1' && message.text === 'Hel',
    ) &&
    appendedMessageActual.some(
      message => message.id === 'reply-1' && message.text === 'Hello',
    );
  const shiftedOverwriteObserved =
    shiftedIndexActual.filter(message => message.id === 'continued-reply')
      .length === 2 &&
    !shiftedIndexActual.some(message => message.id === 'user-later') &&
    shiftedIndexActual.some(message =>
      message.toolStates.includes('call-1:output-available'),
    );

  if (
    appendedMessageMismatch != null &&
    shiftedIndexMismatch != null &&
    duplicateReplyObserved &&
    shiftedOverwriteObserved
  ) {
    throw new Error(failureSignal);
  }

  if (appendedMessageMismatch != null) {
    throw appendedMessageMismatch;
  }

  if (shiftedIndexMismatch != null) {
    throw shiftedIndexMismatch;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
