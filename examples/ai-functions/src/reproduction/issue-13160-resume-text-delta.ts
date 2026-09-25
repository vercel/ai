import {
  AbstractChat,
  type ChatInit,
  type ChatState,
  type ChatStatus,
  type UIMessage,
  type UIMessageChunk,
  UIMessageStreamError,
} from 'ai';

class MemoryChatState implements ChatState<UIMessage> {
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
  constructor(init: Omit<ChatInit<UIMessage>, 'messages'>) {
    super({ ...init, state: new MemoryChatState() });
  }
}

function createDisconnectedStream(
  chunks: UIMessageChunk[],
): ReadableStream<UIMessageChunk> {
  let index = 0;

  return new ReadableStream({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(chunks[index++]);
      } else {
        controller.error(new TypeError('network connection lost'));
      }
    },
  });
}

function createStream(
  chunks: UIMessageChunk[],
): ReadableStream<UIMessageChunk> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

function assistantText(messages: UIMessage[]): string {
  return messages
    .filter(message => message.role === 'assistant')
    .flatMap(message => message.parts)
    .filter(part => part.type === 'text')
    .map(part => part.text)
    .join('');
}

function chatStatus(chat: AbstractChat<UIMessage>): ChatStatus {
  return chat.status;
}

async function main() {
  const errors: Error[] = [];
  const chat = new ReproductionChat({
    id: 'issue-13160',
    generateId: (() => {
      let counter = 0;
      return () => `generated-${counter++}`;
    })(),
    transport: {
      sendMessages: async () =>
        createDisconnectedStream([
          { type: 'start', messageId: 'assistant-1' },
          { type: 'start-step' },
          { type: 'text-start', id: 'text-1' },
          { type: 'text-delta', id: 'text-1', delta: 'Hello' },
        ]),
      reconnectToStream: async () =>
        createStream([
          {
            type: 'text-delta',
            id: 'text-1',
            delta: ' and loved well',
          },
          { type: 'text-end', id: 'text-1' },
          { type: 'finish-step' },
          { type: 'finish', finishReason: 'stop' },
        ]),
    },
    onError: error => {
      errors.push(error);
    },
  });

  await chat.sendMessage({ text: 'Continue the response.' });

  if (
    assistantText(chat.messages) !== 'Hello' ||
    chatStatus(chat) !== 'error'
  ) {
    throw new Error(
      'Reproduction setup failed: the initial stream did not disconnect after producing partial assistant text.',
    );
  }

  chat.clearError();
  await chat.resumeStream();

  const finalStatus = chatStatus(chat);
  const finalText = assistantText(chat.messages);
  const resumeError = errors.at(-1);

  if (finalStatus === 'ready' && finalText === 'Hello and loved well') {
    return;
  }

  if (
    finalStatus === 'error' &&
    finalText === 'Hello' &&
    UIMessageStreamError.isInstance(resumeError) &&
    resumeError.chunkType === 'text-delta' &&
    resumeError.chunkId === 'text-1'
  ) {
    throw new Error(
      'ISSUE_13160_REPRODUCED: resumeStream failed to append a resumed text-delta to the existing assistant text part',
    );
  }

  throw new Error(
    `Expected resumed chat status "ready" with assistant text "Hello and loved well", got status ${JSON.stringify(finalStatus)} and text ${JSON.stringify(finalText)}.`,
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
