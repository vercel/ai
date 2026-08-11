import {
  AbstractChat,
  type ChatInit,
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

class ReproductionChat extends AbstractChat<UIMessage> {
  constructor(init: ChatInit<UIMessage>) {
    super({ ...init, state: new ReproductionChatState() });
  }
}

async function main() {
  let transportCalls = 0;

  const transport: ChatTransport<UIMessage> = {
    async sendMessages() {
      transportCalls++;
      return new ReadableStream<UIMessageChunk>({
        start(controller) {
          controller.close();
        },
      });
    },
    async reconnectToStream() {
      return null;
    },
  };

  let nextId = 0;
  const chat = new ReproductionChat({
    id: 'issue-7891',
    generateId: () => `message-${nextId++}`,
    transport,
  });

  // React Strict Mode's development lifecycle is setup -> cleanup -> setup.
  const firstSetup = chat.sendMessage({ text: 'Hello' });
  const cleanup = chat.stop();
  const secondSetup = chat.sendMessage({ text: 'Hello' });

  await Promise.all([firstSetup, cleanup, secondSetup]);

  if (transportCalls !== 1) {
    throw new Error(
      `ISSUE #7891 REPRODUCED: Strict Mode cleanup failed to cancel the first send; expected 1 transport request, observed ${transportCalls}.`,
    );
  }

  console.log(
    'Issue #7891 did not reproduce: Strict Mode cleanup cancelled the first send.',
  );
}

await main();
