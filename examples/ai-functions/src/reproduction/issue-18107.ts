import assert from 'node:assert/strict';
import {
  AbstractChat,
  readUIMessageStream,
  type ChatState,
  type ChatTransport,
  type UIMessage,
  type UIMessageChunk,
} from 'ai';

function createStream(messageId: string | undefined) {
  const chunks: UIMessageChunk[] = [
    ...(messageId == null ? [] : [{ type: 'start' as const, messageId }]),
    { type: 'start-step' },
    { type: 'text-start', id: 'text-1' },
    { type: 'text-delta', id: 'text-1', delta: 'RESUMED-TEXT' },
    { type: 'text-end', id: 'text-1' },
    { type: 'finish' },
  ];

  return new ReadableStream<UIMessageChunk>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

async function readFinalMessage({
  message,
  messageId,
}: {
  message?: UIMessage;
  messageId?: string;
}) {
  let finalMessage: UIMessage | undefined;

  for await (const nextMessage of readUIMessageStream({
    message,
    stream: createStream(messageId),
  })) {
    finalMessage = nextMessage;
  }

  assert.ok(finalMessage, 'stream must produce a message');
  return finalMessage;
}

function textParts(message: UIMessage) {
  return message.parts.flatMap(part =>
    part.type === 'text' ? [part.text] : [],
  );
}

class MemoryChatState implements ChatState<UIMessage> {
  status = 'ready' as const;
  error = undefined;

  constructor(public messages: UIMessage[]) {}

  pushMessage = (message: UIMessage) => {
    this.messages = [...this.messages, structuredClone(message)];
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

class MemoryChat extends AbstractChat<UIMessage> {
  constructor(messages: UIMessage[]) {
    const state = new MemoryChatState(messages);
    const transport: ChatTransport<UIMessage> = {
      sendMessages: async () => {
        throw new Error('sendMessages is not used by this reproduction');
      },
      reconnectToStream: async () => createStream('turn-1:reply'),
    };

    super({
      id: 'chat-1',
      generateId: () => 'generated-message-id',
      state,
      transport,
    });
  }
}

async function verifyChatResumeCases() {
  const previousTurn: UIMessage[] = [
    {
      id: 'turn-0',
      role: 'user',
      parts: [{ type: 'text', text: 'first question' }],
    },
    {
      id: 'turn-0:reply',
      role: 'assistant',
      parts: [{ type: 'text', text: 'FIRST ANSWER' }],
    },
  ];

  for (const initialMessages of [
    [],
    previousTurn,
    [
      ...previousTurn,
      {
        id: 'turn-1',
        role: 'user' as const,
        parts: [{ type: 'text' as const, text: 'second question' }],
      },
    ],
  ]) {
    const chat = new MemoryChat(structuredClone(initialMessages));
    await chat.resumeStream();

    assert.deepEqual(textParts(chat.messages.at(-1)!), ['RESUMED-TEXT']);
    assert.equal(chat.messages.at(-1)!.id, 'turn-1:reply');
  }
}

async function main() {
  await verifyChatResumeCases();

  const previousReply: UIMessage = {
    id: 'turn-0:reply',
    role: 'assistant',
    parts: [{ type: 'text', text: 'FIRST ANSWER' }],
  };

  const withoutLocalMessage = await readFinalMessage({
    messageId: 'turn-1:reply',
  });
  assert.deepEqual(textParts(withoutLocalMessage), ['RESUMED-TEXT']);

  const matchingMessage = await readFinalMessage({
    message: {
      id: 'turn-1:reply',
      role: 'assistant',
      parts: [{ type: 'text', text: 'PARTIAL-TEXT' }],
    },
    messageId: 'turn-1:reply',
  });
  assert.deepEqual(textParts(matchingMessage), [
    'PARTIAL-TEXT',
    'RESUMED-TEXT',
  ]);

  const streamWithoutMessageId = await readFinalMessage({
    message: previousReply,
  });
  assert.deepEqual(textParts(streamWithoutMessageId), [
    'FIRST ANSWER',
    'RESUMED-TEXT',
  ]);

  const mismatchedMessage = await readFinalMessage({
    message: previousReply,
    messageId: 'turn-1:reply',
  });
  const mismatchedTexts = textParts(mismatchedMessage);

  if (mismatchedTexts.includes('FIRST ANSWER')) {
    throw new Error(
      `ISSUE_18107_REPRODUCED: resumed message ${mismatchedMessage.id} retained foreign text FIRST ANSWER`,
    );
  }

  assert.deepEqual(mismatchedTexts, ['RESUMED-TEXT']);
}

main();
