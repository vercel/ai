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

  pushMessage = (message: UIMessage) => {
    this.messages = this.messages.concat(message);
  };

  popMessage = () => {
    this.messages = this.messages.slice(0, -1);
  };

  replaceMessage = (index: number, message: UIMessage) => {
    this.messages = [
      ...this.messages.slice(0, index),
      structuredClone(message),
      ...this.messages.slice(index + 1),
    ];
  };

  snapshot = <T>(value: T): T => structuredClone(value);
}

class ReproductionChat extends AbstractChat<UIMessage> {}

const replayedChunks: UIMessageChunk[] = [
  { type: 'start', messageId: 'assistant-1' },
  { type: 'start-step' },
  { type: 'reasoning-start', id: 'reasoning-1' },
  {
    type: 'reasoning-delta',
    id: 'reasoning-1',
    delta: 'thinking...',
  },
  { type: 'reasoning-end', id: 'reasoning-1' },
  { type: 'text-start', id: 'text-1' },
  { type: 'text-delta', id: 'text-1', delta: 'Hello, world!' },
  { type: 'text-end', id: 'text-1' },
  { type: 'finish-step' },
];

function createStream({
  chunks,
  error,
}: {
  chunks: UIMessageChunk[];
  error?: Error;
}) {
  let index = 0;

  return new ReadableStream<UIMessageChunk>({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(chunks[index++]);
      } else if (error != null) {
        controller.error(error);
      } else {
        controller.close();
      }
    },
  });
}

async function main() {
  const transport: ChatTransport<UIMessage> = {
    sendMessages: async () =>
      createStream({
        chunks: replayedChunks,
        error: new TypeError('simulated network disconnect'),
      }),
    reconnectToStream: async () =>
      createStream({
        chunks: [...replayedChunks, { type: 'finish', finishReason: 'stop' }],
      }),
  };

  const chat = new ReproductionChat({
    id: 'issue-14688',
    generateId: () => 'generated-id',
    transport,
    state: new ReproductionChatState(),
    onError: () => {},
  });

  await chat.sendMessage({ text: 'Say hello.' });

  const persistedAssistantMessage = structuredClone(chat.messages.at(-1));
  if (
    chat.status !== 'error' ||
    persistedAssistantMessage?.role !== 'assistant'
  ) {
    throw new Error(
      'Expected the first attempt to persist a partial assistant message after a network disconnect.',
    );
  }

  chat.clearError();
  await chat.resumeStream();

  const assistantMessage = chat.messages.at(-1);
  if (assistantMessage?.role !== 'assistant') {
    throw new Error('Expected an assistant message after resuming the stream.');
  }

  const textParts = assistantMessage.parts.filter(part => part.type === 'text');
  const reasoningParts = assistantMessage.parts.filter(
    part => part.type === 'reasoning',
  );
  const renderedText = textParts.map(part => part.text).join('');
  const renderedReasoning = reasoningParts.map(part => part.text).join('');

  console.log(
    JSON.stringify(
      {
        persistedParts: persistedAssistantMessage.parts,
        resumedParts: assistantMessage.parts,
        textPartCount: textParts.length,
        reasoningPartCount: reasoningParts.length,
        renderedText,
        renderedReasoning,
      },
      null,
      2,
    ),
  );

  if (
    textParts.length !== 1 ||
    reasoningParts.length !== 1 ||
    renderedText !== 'Hello, world!' ||
    renderedReasoning !== 'thinking...'
  ) {
    throw new Error(
      'Reproduced issue #14688: resumeStream replay duplicated persisted text and reasoning parts.',
    );
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
