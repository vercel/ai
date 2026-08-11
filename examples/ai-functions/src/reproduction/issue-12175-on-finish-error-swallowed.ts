import {
  AbstractChat,
  type ChatState,
  type ChatStatus,
  type ChatTransport,
  type UIMessage,
  type UIMessageChunk,
} from 'ai';

class InMemoryChatState implements ChatState<UIMessage> {
  status: ChatStatus = 'ready';
  error: Error | undefined;
  messages: UIMessage[] = [];

  pushMessage(message: UIMessage) {
    this.messages = [...this.messages, message];
  }

  popMessage() {
    this.messages = this.messages.slice(0, -1);
  }

  replaceMessage(index: number, message: UIMessage) {
    this.messages = [
      ...this.messages.slice(0, index),
      message,
      ...this.messages.slice(index + 1),
    ];
  }

  snapshot<T>(value: T): T {
    return value;
  }
}

class InMemoryChat extends AbstractChat<UIMessage> {
  constructor({
    transport,
    onFinish,
  }: {
    transport: ChatTransport<UIMessage>;
    onFinish: () => void;
  }) {
    let nextId = 0;

    super({
      id: 'issue-12175',
      generateId: () => `message-${nextId++}`,
      state: new InMemoryChatState(),
      transport,
      onFinish,
    });
  }
}

const transport: ChatTransport<UIMessage> = {
  async sendMessages() {
    return new ReadableStream<UIMessageChunk>({
      start(controller) {
        controller.enqueue({ type: 'finish', finishReason: 'stop' });
        controller.close();
      },
    });
  },
  async reconnectToStream() {
    return null;
  },
};

async function main() {
  const onFinishError = new Error('issue-12175 onFinish callback failure');
  let onFinishCalled = false;

  const chat = new InMemoryChat({
    transport,
    onFinish: () => {
      onFinishCalled = true;
      throw onFinishError;
    },
  });

  const originalConsoleError = console.error;
  const loggedErrors: unknown[][] = [];
  console.error = (...args: unknown[]) => {
    loggedErrors.push(args);
  };

  let sendMessageError: unknown;

  try {
    await chat.sendMessage({ text: 'Hello' });
  } catch (error) {
    sendMessageError = error;
  } finally {
    console.error = originalConsoleError;
  }

  const callbackErrorWasLogged = loggedErrors.some(
    args => args[0] === onFinishError,
  );

  console.log(
    JSON.stringify(
      {
        onFinishCalled,
        callbackErrorWasLogged,
        sendMessageRejected: sendMessageError !== undefined,
        rejectedWithCallbackError: sendMessageError === onFinishError,
      },
      null,
      2,
    ),
  );

  if (!onFinishCalled) {
    throw new Error('Reproduction setup failed: onFinish was not called.');
  }

  if (sendMessageError === onFinishError) {
    return;
  }

  if (sendMessageError !== undefined) {
    throw new Error(
      `Reproduction setup failed: sendMessage rejected with an unrelated error: ${String(
        sendMessageError,
      )}`,
    );
  }

  if (!callbackErrorWasLogged) {
    throw new Error(
      'Reproduction setup failed: the onFinish error was neither propagated nor logged.',
    );
  }

  throw new Error(
    'Reproduced issue #12175: chat.sendMessage() resolved after onFinish threw instead of rejecting.',
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
