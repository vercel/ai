import {
  AbstractChat,
  type ChatState,
  type ChatStatus,
  type ChatTransport,
  type UIMessage,
  type UIMessageChunk,
} from 'ai';

class ReproductionChatState implements ChatState<UIMessage> {
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

class ReproductionChat extends AbstractChat<UIMessage> {
  constructor({
    transport,
    onFinish,
  }: {
    transport: ChatTransport<UIMessage>;
    onFinish: () => void;
  }) {
    super({
      id: 'issue-12175',
      generateId: () => 'generated-message-id',
      state: new ReproductionChatState(),
      transport,
      onFinish,
    });
  }
}

const transport: ChatTransport<UIMessage> = {
  async sendMessages() {
    return new ReadableStream<UIMessageChunk>({
      start(controller) {
        controller.enqueue({ type: 'start' });
        controller.enqueue({ type: 'start-step' });
        controller.enqueue({ type: 'finish-step' });
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
  const onFinishError = new Error('issue-12175 onFinish failure');
  let onFinishCalled = false;
  const loggedErrors: unknown[][] = [];
  const originalConsoleError = console.error;

  const chat = new ReproductionChat({
    transport,
    onFinish: () => {
      onFinishCalled = true;
      throw onFinishError;
    },
  });

  let rejection: unknown;

  console.error = (...args: unknown[]) => {
    loggedErrors.push(args);
  };

  try {
    await chat.sendMessage({ text: 'hello' });
  } catch (error) {
    rejection = error;
  } finally {
    console.error = originalConsoleError;
  }

  if (!onFinishCalled) {
    throw new Error('REPRODUCTION_SETUP_FAILURE: onFinish was not called');
  }

  if (rejection === onFinishError) {
    console.log(
      'EXPECTED_BEHAVIOR: chat.sendMessage() rejected with the error thrown by onFinish',
    );
    return;
  }

  if (rejection !== undefined) {
    throw new Error(
      `UNEXPECTED_REJECTION: chat.sendMessage() rejected with ${String(rejection)}`,
    );
  }

  if (!loggedErrors.some(args => args.includes(onFinishError))) {
    throw new Error(
      'SECONDARY_ASSERTION_FAILURE: the swallowed onFinish error was not logged with console.error',
    );
  }

  throw new Error(
    'REPRODUCTION_FAILURE: chat.sendMessage() resolved instead of rejecting the error thrown by onFinish',
  );
}

main();
