import {
  AbstractChat,
  type ChatState,
  type ChatStatus,
  type ChatTransport,
  type UIMessage,
  type UIMessageChunk,
} from 'ai';

class State implements ChatState<UIMessage> {
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

function chunkStream(chunks: UIMessageChunk[]) {
  let index = 0;

  return new ReadableStream<UIMessageChunk>({
    pull(controller) {
      if (index >= chunks.length) {
        controller.close();
      } else {
        controller.enqueue(chunks[index++]);
      }
    },
  });
}

function text(message: UIMessage | undefined) {
  return (
    message?.parts
      .filter(part => part.type === 'text')
      .map(part => part.text)
      .join(' | ') ?? ''
  );
}

async function main() {
  const previousAnswer = 'Q2 revenue was $4.2M.';
  const resumedAnswer = 'Q3 is trending 12% higher.';
  const state = new State([
    {
      id: 'u1',
      role: 'user',
      parts: [{ type: 'text', text: 'What was Q2 revenue?' }],
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

  const previousAnswerOccurrences = state.messages.filter(message =>
    text(message).includes(previousAnswer),
  ).length;
  const resumedMessage = state.messages.find(
    message => message.id === 'server-msg-2',
  );
  const resumedText = text(resumedMessage);

  if (previousAnswerOccurrences !== 1 || resumedText.includes(previousAnswer)) {
    console.error(
      'ISSUE_18457_REPRODUCED: resumeStream duplicated the previous assistant message',
    );
    console.error(JSON.stringify(state.messages, null, 2));
    process.exitCode = 1;
    return;
  }

  if (
    state.messages.length !== 3 ||
    resumedText !== resumedAnswer ||
    text(state.messages[1]) !== previousAnswer
  ) {
    throw new Error(
      `Unexpected resumeStream result: ${JSON.stringify(state.messages)}`,
    );
  }

  console.log('Issue #18457 did not reproduce.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
