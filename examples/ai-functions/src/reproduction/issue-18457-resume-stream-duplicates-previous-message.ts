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

  constructor(public messages: UIMessage[]) {}

  pushMessage = (message: UIMessage) => {
    this.messages = [...this.messages, message];
  };

  popMessage = () => {
    this.messages = this.messages.slice(0, -1);
  };

  replaceMessage = (index: number, message: UIMessage) => {
    this.messages = this.messages.map((current, currentIndex) =>
      currentIndex === index ? message : current,
    );
  };

  snapshot = <T>(value: T): T => structuredClone(value);
}

class Chat extends AbstractChat<UIMessage> {}

function chunkStream(chunks: UIMessageChunk[]): ReadableStream<UIMessageChunk> {
  let index = 0;

  return new ReadableStream({
    pull(controller) {
      if (index === chunks.length) {
        controller.close();
      } else {
        controller.enqueue(chunks[index++]);
      }
    },
  });
}

function textContent(message: UIMessage): string[] {
  return message.parts
    .filter(part => part.type === 'text')
    .map(part => part.text);
}

async function main() {
  const previousAnswer = 'The capital of France is Paris.';
  const resumedAnswer = 'It has been the capital since 987 AD.';

  const state = new InMemoryChatState([
    {
      id: 'u1',
      role: 'user',
      parts: [{ type: 'text', text: 'What is the capital of France?' }],
    },
    {
      id: 'a1',
      role: 'assistant',
      parts: [{ type: 'text', text: previousAnswer }],
    },
  ]);

  const transport: ChatTransport<UIMessage> = {
    sendMessages: async () => chunkStream([]),
    reconnectToStream: async () =>
      chunkStream([
        { type: 'start', messageId: 'server-msg-2' },
        { type: 'text-start', id: 't1' },
        { type: 'text-delta', id: 't1', delta: resumedAnswer },
        { type: 'text-end', id: 't1' },
        { type: 'finish' },
      ]),
  };

  const chat = new Chat({
    id: 'c1',
    state,
    transport,
    generateId: () => 'client-generated',
  });

  await chat.resumeStream();

  const previousMessage = state.messages.find(message => message.id === 'a1');
  const resumedMessage = state.messages.find(
    message => message.id === 'server-msg-2',
  );
  const previousText = previousMessage ? textContent(previousMessage) : [];
  const resumedText = resumedMessage ? textContent(resumedMessage) : [];

  console.log(JSON.stringify(state.messages, null, 2));

  if (
    state.messages.length === 3 &&
    previousText.includes(previousAnswer) &&
    resumedText.includes(previousAnswer) &&
    resumedText.includes(resumedAnswer)
  ) {
    throw new Error(
      'ISSUE_18457_REPRODUCED: resumeStream duplicated previous assistant message a1 into server-msg-2',
    );
  }

  if (
    state.messages.length !== 3 ||
    previousText.join('') !== previousAnswer ||
    resumedText.join('') !== resumedAnswer
  ) {
    throw new Error(
      `Unexpected result: ${JSON.stringify(state.messages, null, 2)}`,
    );
  }

  console.log(
    'Issue not reproduced: the previous answer remained once and the resumed message contained only new content.',
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
