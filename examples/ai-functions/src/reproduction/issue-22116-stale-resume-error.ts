import assert from 'node:assert/strict';
import {
  AbstractChat,
  type ChatInit,
  type ChatState,
  type ChatStatus,
  type ChatTransport,
  type UIMessage,
} from 'ai';

class ObservableChatState implements ChatState<UIMessage> {
  status: ChatStatus = 'ready';
  messages: UIMessage[] = [];
  #error: Error | undefined;

  constructor(private readonly onErrorChange: (error?: Error) => void) {}

  get error() {
    return this.#error;
  }

  set error(error: Error | undefined) {
    this.#error = error;
    this.onErrorChange(error);
  }

  pushMessage = (message: UIMessage) => {
    this.messages = [...this.messages, message];
  };

  popMessage = () => {
    this.messages = this.messages.slice(0, -1);
  };

  replaceMessage = (index: number, message: UIMessage) => {
    this.messages = this.messages.map((old, currentIndex) =>
      currentIndex === index ? message : old,
    );
  };

  snapshot = <T>(value: T): T => value;
}

class TestChat extends AbstractChat<UIMessage> {
  constructor({
    state,
    ...init
  }: ChatInit<UIMessage> & { state: ChatState<UIMessage> }) {
    super({ ...init, state });
  }
}

async function main() {
  const reconnectErrors = [
    new Error('first reconnect failure'),
    new Error('second reconnect failure'),
  ];
  const onErrorMessages: string[] = [];
  let reconnectAttempt = 0;

  const transport: ChatTransport<UIMessage> = {
    async sendMessages() {
      throw new Error('unexpected sendMessages call');
    },
    async reconnectToStream() {
      throw reconnectErrors[reconnectAttempt++];
    },
  };

  const subscriberErrorMessages: Array<string | undefined> = [];
  const state = new ObservableChatState(error => {
    subscriberErrorMessages.push(error?.message);
  });
  const chat = new TestChat({
    id: 'issue-22116',
    transport,
    state,
    onError: error => {
      onErrorMessages.push(error.message);
    },
  });

  await chat.resumeStream();

  assert.equal(chat.status, 'error');
  assert.equal(chat.error, reconnectErrors[0]);
  assert.deepEqual(onErrorMessages, ['first reconnect failure']);
  assert.deepEqual(subscriberErrorMessages, ['first reconnect failure']);

  await chat.resumeStream();

  assert.equal(chat.status, 'error');
  assert.deepEqual(onErrorMessages, [
    'first reconnect failure',
    'second reconnect failure',
  ]);
  assert.deepEqual(
    {
      publicError: chat.error?.message,
      subscriberErrorMessages,
    },
    {
      publicError: 'second reconnect failure',
      subscriberErrorMessages: [
        'first reconnect failure',
        'second reconnect failure',
      ],
    },
    'Repeated resumeStream() failures must publish the latest error through chat.error and error-state subscribers',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
