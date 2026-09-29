import {
  AbstractChat,
  type ChatInit,
  type ChatState,
  type ChatStatus,
  type UIMessage,
  type UIMessageChunk,
} from 'ai';

class ReproductionChatState implements ChatState<UIMessage> {
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
    this.messages = [
      ...this.messages.slice(0, index),
      message,
      ...this.messages.slice(index + 1),
    ];
  };

  snapshot = <T>(value: T): T => structuredClone(value);
}

class ReproductionChat extends AbstractChat<UIMessage> {
  constructor(init: ChatInit<UIMessage>) {
    super({ ...init, state: new ReproductionChatState() });
  }
}

async function waitFor(condition: () => boolean): Promise<void> {
  const deadline = Date.now() + 1_000;

  while (!condition()) {
    if (Date.now() >= deadline) {
      throw new Error('Timed out waiting for the chat stream to start');
    }

    await new Promise(resolve => setTimeout(resolve, 0));
  }
}

async function main() {
  let onFinishCalled = false;
  let streamCancelled = false;
  let nextId = 0;

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
      // Keep the response open until stop() cancels it.
    },
    cancel() {
      streamCancelled = true;
    },
  });

  const chat = new ReproductionChat({
    generateId: () => `id-${nextId++}`,
    transport: {
      sendMessages: async () => responseStream,
      reconnectToStream: async () => null,
    },
    onFinish: () => {
      onFinishCalled = true;
    },
  });

  const requestPromise = chat.sendMessage({ text: 'start' });

  await waitFor(
    () =>
      chat.status === 'streaming' &&
      chat.messages.some(message =>
        message.parts.some(
          part => part.type === 'text' && part.text === 'BEFORE_STOP',
        ),
      ),
  );

  await chat.stop();

  const statusAfterAwaitedStop = chat.status;
  const finishAfterAwaitedStop = onFinishCalled;
  const cancelAfterAwaitedStop = streamCancelled;

  // This is the user flow from the issue: stop, then clear the conversation.
  chat.messages = [];

  await requestPromise;
  await new Promise(resolve => setTimeout(resolve, 0));

  const terminalAfterAwaitedStop =
    statusAfterAwaitedStop === 'ready' || statusAfterAwaitedStop === 'error';
  const messagesStayedCleared = chat.messages.length === 0;

  console.log(
    JSON.stringify(
      {
        statusAfterAwaitedStop,
        finishAfterAwaitedStop,
        cancelAfterAwaitedStop,
        finalStatus: chat.status,
        finalOnFinishCalled: onFinishCalled,
        finalStreamCancelled: streamCancelled,
        messagesStayedCleared,
      },
      null,
      2,
    ),
  );

  if (!terminalAfterAwaitedStop || !finishAfterAwaitedStop) {
    console.error(
      'ISSUE_13962_REPRODUCED: await chat.stop() returned before the stream pipeline reached a terminal state',
    );
    process.exitCode = 1;
    return;
  }

  if (!messagesStayedCleared) {
    console.error(
      'ISSUE_13962_REPRODUCED: chat messages were updated after awaited stop and clear',
    );
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error('REPRODUCTION_HARNESS_ERROR', error);
  process.exitCode = 2;
});
