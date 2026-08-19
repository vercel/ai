import {
  AbstractChat,
  type ChatInit,
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

  pushMessage = (message: UIMessage) => {
    this.messages = [...this.messages, message];
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

class InMemoryChat extends AbstractChat<UIMessage> {
  constructor(init: ChatInit<UIMessage>) {
    super({ ...init, state: new InMemoryChatState() });
  }
}

const transport: ChatTransport<UIMessage> = {
  async sendMessages() {
    const chunks: UIMessageChunk[] = [
      { type: 'start' },
      { type: 'start-step' },
      { type: 'text-start', id: 'text-1' },
      { type: 'text-delta', id: 'text-1', delta: 'Hello' },
      { type: 'text-end', id: 'text-1' },
      { type: 'finish-step' },
      { type: 'finish', finishReason: 'stop' },
    ];

    return new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(chunk);
        }
        controller.close();
      },
    });
  },
  async reconnectToStream() {
    return null;
  },
};

async function main() {
  const onFinishError = new Error('issue-12175 onFinish error');
  let onFinishCalled = false;
  let loggedError: unknown;

  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    loggedError = args[0];
  };

  const chat = new InMemoryChat({
    transport,
    onFinish() {
      onFinishCalled = true;
      throw onFinishError;
    },
  });

  let rejectedWith: unknown;
  try {
    await chat.sendMessage({ text: 'Hello' });
  } catch (error) {
    rejectedWith = error;
  } finally {
    console.error = originalConsoleError;
  }

  if (!onFinishCalled) {
    throw new Error('Reproduction setup failed: onFinish was not called');
  }

  if (rejectedWith === onFinishError) {
    console.log('onFinish error propagated through chat.sendMessage()');
    return;
  }

  if (rejectedWith !== undefined) {
    throw new Error(
      `Reproduction setup failed: sendMessage rejected with an unexpected error: ${String(rejectedWith)}`,
    );
  }

  if (loggedError !== onFinishError) {
    throw new Error(
      'Reproduction setup failed: onFinish error was neither propagated nor logged',
    );
  }

  throw new Error(
    'ISSUE 12175 REPRODUCED: chat.sendMessage() resolved instead of rejecting with the onFinish error',
  );
}

await main();
