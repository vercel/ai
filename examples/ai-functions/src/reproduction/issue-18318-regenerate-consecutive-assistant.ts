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

  constructor(public messages: UIMessage[]) {}

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
    super({
      ...init,
      state: new ReproductionChatState(init.messages ?? []),
    });
  }
}

function createChunkStream(chunks: UIMessageChunk[]) {
  return new ReadableStream<UIMessageChunk>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

async function main() {
  const initialMessages = [
    {
      id: 'user',
      role: 'user',
      parts: [{ type: 'text', text: 'prompt' }],
    },
    {
      id: 'assistant-parent',
      role: 'assistant',
      parts: [{ type: 'text', text: 'parent' }],
    },
    {
      id: 'assistant-target',
      role: 'assistant',
      parts: [{ type: 'text', text: 'target' }],
    },
  ] satisfies UIMessage[];

  let capturedRequest:
    | {
        trigger: 'submit-message' | 'regenerate-message';
        messageId: string | undefined;
        messages: UIMessage[];
      }
    | undefined;

  const transport: ChatTransport<UIMessage> = {
    async sendMessages({ trigger, messageId, messages }) {
      capturedRequest = {
        trigger,
        messageId,
        messages: structuredClone(messages),
      };

      return createChunkStream([
        { type: 'start' },
        { type: 'text-start', id: 'text-1' },
        {
          type: 'text-delta',
          id: 'text-1',
          delta: 'regenerated target',
        },
        { type: 'text-end', id: 'text-1' },
        { type: 'finish', finishReason: 'stop' },
      ]);
    },
    async reconnectToStream() {
      return null;
    },
  };

  let nextId = 0;
  const chat = new ReproductionChat({
    id: 'chat',
    generateId: () => `id-${nextId++}`,
    messages: structuredClone(initialMessages),
    transport,
  });

  await chat.regenerate({ messageId: 'assistant-target' });

  const expectedRequest = {
    trigger: 'regenerate-message',
    messageId: 'assistant-target',
    messages: initialMessages.slice(0, 2),
  };

  if (JSON.stringify(capturedRequest) !== JSON.stringify(expectedRequest)) {
    throw new Error(
      `Unexpected transport request: ${JSON.stringify(capturedRequest)}`,
    );
  }

  const expectedMessages: UIMessage[] = [
    initialMessages[0],
    initialMessages[1],
    {
      id: 'id-0',
      role: 'assistant',
      parts: [{ type: 'text', text: 'regenerated target' }],
    },
  ];

  if (JSON.stringify(chat.messages) === JSON.stringify(expectedMessages)) {
    console.log('Issue not reproduced: regeneration preserved both messages.');
    return;
  }

  const mergedIntoParent =
    chat.messages.length === 2 &&
    chat.messages[1].id === 'assistant-parent' &&
    chat.messages[1].parts.some(
      part => part.type === 'text' && part.text === 'parent',
    ) &&
    chat.messages[1].parts.some(
      part => part.type === 'text' && part.text === 'regenerated target',
    );

  if (mergedIntoParent) {
    console.error(
      'ISSUE_REPRODUCED: regenerate merged the replacement into the preceding assistant message',
    );
    console.error(JSON.stringify(chat.messages));
    process.exitCode = 1;
    return;
  }

  throw new Error(
    `Regeneration produced an unexpected message history: ${JSON.stringify(chat.messages)}`,
  );
}

main();
