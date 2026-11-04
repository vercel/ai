import {
  AbstractChat,
  type ChatState,
  type ChatStatus,
  type UIMessage,
  type UIMessageChunk,
} from 'ai';

const failureSignal =
  'ISSUE_22288_REPRODUCED: resumeStream duplicated the retained step and text parts';

class State implements ChatState<UIMessage> {
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
    this.messages = this.messages.map((old, i) =>
      i === index ? message : old,
    );
  };

  snapshot = <T>(value: T): T => structuredClone(value);
}

const delivered: UIMessageChunk[] = [
  { type: 'start', messageId: 'assistant-1' },
  { type: 'start-step' },
  { type: 'text-start', id: 'text-1' },
  { type: 'text-delta', id: 'text-1', delta: 'Hello' },
];

const replayed: UIMessageChunk[] = [
  ...delivered,
  { type: 'text-delta', id: 'text-1', delta: ' world' },
  { type: 'text-end', id: 'text-1' },
  { type: 'finish-step' },
  { type: 'finish', finishReason: 'stop' },
];

function stream(chunks: UIMessageChunk[], { fail = false } = {}) {
  let index = 0;

  return new ReadableStream<UIMessageChunk>({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(chunks[index++]);
      } else if (fail) {
        controller.error(new TypeError('network connection lost'));
      } else {
        controller.close();
      }
    },
  });
}

class Chat extends AbstractChat<UIMessage> {
  constructor() {
    super({
      id: 'chat-1',
      state: new State(),
      transport: {
        sendMessages: async () => stream(delivered, { fail: true }),
        reconnectToStream: async () => stream(replayed),
      },
    });
  }
}

function shape(parts: UIMessage['parts']) {
  return parts.map(part =>
    part.type === 'text'
      ? { type: part.type, text: part.text, state: part.state }
      : { type: part.type },
  );
}

function matches(actual: unknown, expected: unknown) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

async function main() {
  const chat = new Chat();

  await chat.sendMessage({ text: 'hi' }).catch(() => {});

  const disconnectedShape = shape(chat.messages.at(-1)?.parts ?? []);
  const expectedDisconnectedShape = [
    { type: 'step-start' },
    { type: 'text', text: 'Hello', state: 'streaming' },
  ];

  if (
    chat.status !== 'error' ||
    !matches(disconnectedShape, expectedDisconnectedShape)
  ) {
    throw new Error(
      `Unexpected disconnect state: ${JSON.stringify({
        status: chat.status,
        parts: disconnectedShape,
      })}`,
    );
  }

  chat.clearError();
  await chat.resumeStream();

  const resumedShape = shape(chat.messages.at(-1)?.parts ?? []);
  const expectedResumedShape = [
    { type: 'step-start' },
    { type: 'text', text: 'Hello world', state: 'done' },
  ];
  const duplicatedShape = [
    { type: 'step-start' },
    { type: 'text', text: 'Hello', state: 'streaming' },
    { type: 'step-start' },
    { type: 'text', text: 'Hello world', state: 'done' },
  ];

  if (matches(resumedShape, expectedResumedShape)) {
    console.log('ok');
    return;
  }

  if (matches(resumedShape, duplicatedShape)) {
    throw new Error(failureSignal);
  }

  throw new Error(
    `Unexpected resumed message shape: ${JSON.stringify(resumedShape)}`,
  );
}

await main();
