import assert from 'node:assert/strict';
import {
  AbstractChat,
  readUIMessageStream,
  type ChatInit,
  type ChatState,
  type ChatStatus,
  type UIMessage,
  type UIMessageChunk,
} from 'ai';

class ReproductionChatState implements ChatState<UIMessage> {
  status: ChatStatus = 'ready';
  error: Error | undefined;
  messages: UIMessage[];

  constructor(messages: UIMessage[]) {
    this.messages = structuredClone(messages);
  }

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

function createResumedStream({
  messageId = 'turn-1:reply',
}: {
  messageId?: string | null;
} = {}) {
  const chunks: UIMessageChunk[] = [
    ...(messageId === null ? [] : [{ type: 'start' as const, messageId }]),
    { type: 'start-step' },
    { type: 'text-start', id: 'resumed-text' },
    {
      type: 'text-delta',
      id: 'resumed-text',
      delta: 'RESUMED-TEXT',
    },
    { type: 'text-end', id: 'resumed-text' },
    { type: 'finish-step' },
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

function textParts(message: UIMessage | undefined) {
  return (
    message?.parts.flatMap(part => (part.type === 'text' ? [part.text] : [])) ??
    []
  );
}

async function readFinalMessage({
  seed,
  messageId = 'turn-1:reply',
}: {
  seed?: UIMessage;
  messageId?: string | null;
}) {
  let finalMessage: UIMessage | undefined;

  for await (const message of readUIMessageStream({
    message: seed == null ? undefined : structuredClone(seed),
    stream: createResumedStream({ messageId }),
  })) {
    finalMessage = message;
  }

  assert.ok(finalMessage, 'the resumed stream should emit a UI message');
  return finalMessage;
}

async function verifyAbstractChatResumeCases() {
  const previousMessages: UIMessage[] = [
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

  const cases: Array<{
    name: string;
    messages: UIMessage[];
    expectedLength: number;
  }> = [
    { name: 'no local messages', messages: [], expectedLength: 1 },
    {
      name: 'previous assistant is last',
      messages: previousMessages,
      expectedLength: 3,
    },
    {
      name: 'resumed turn user message is last',
      messages: [
        ...previousMessages,
        {
          id: 'turn-1',
          role: 'user',
          parts: [{ type: 'text', text: 'second question' }],
        },
      ],
      expectedLength: 4,
    },
  ];

  for (const testCase of cases) {
    const chat = new ReproductionChat({
      id: `chat-${testCase.name}`,
      messages: testCase.messages,
      generateId: () => 'locally-generated-id',
      transport: {
        sendMessages: async () => {
          throw new Error('sendMessages is not used by this reproduction');
        },
        reconnectToStream: async () => createResumedStream(),
      },
    });

    await chat.resumeStream();

    assert.equal(chat.messages.length, testCase.expectedLength, testCase.name);
    assert.equal(chat.messages.at(-1)?.id, 'turn-1:reply', testCase.name);
    assert.deepEqual(
      textParts(chat.messages.at(-1)),
      ['RESUMED-TEXT'],
      testCase.name,
    );
  }
}

async function main() {
  await verifyAbstractChatResumeCases();

  const foreignSeed: UIMessage = {
    id: 'turn-0:reply',
    role: 'assistant',
    parts: [{ type: 'text', text: 'FIRST ANSWER' }],
  };

  const matchingSeed: UIMessage = {
    ...foreignSeed,
    id: 'turn-1:reply',
  };

  const matchingIdResult = await readFinalMessage({ seed: matchingSeed });
  assert.deepEqual(textParts(matchingIdResult), [
    'FIRST ANSWER',
    'RESUMED-TEXT',
  ]);

  const noStreamIdResult = await readFinalMessage({
    seed: foreignSeed,
    messageId: null,
  });
  assert.equal(noStreamIdResult.id, 'turn-0:reply');
  assert.deepEqual(textParts(noStreamIdResult), [
    'FIRST ANSWER',
    'RESUMED-TEXT',
  ]);

  const mismatchedIdResult = await readFinalMessage({ seed: foreignSeed });
  const resumedTexts = textParts(mismatchedIdResult);
  const renderedConversation: UIMessage[] = [
    {
      id: 'turn-0',
      role: 'user',
      parts: [{ type: 'text', text: 'first question' }],
    },
    foreignSeed,
    mismatchedIdResult,
  ];
  const firstAnswerOccurrences = renderedConversation
    .flatMap(textParts)
    .filter(text => text === 'FIRST ANSWER').length;

  if (
    mismatchedIdResult.id === 'turn-1:reply' &&
    resumedTexts.includes('FIRST ANSWER') &&
    firstAnswerOccurrences === 2
  ) {
    console.error(
      'ISSUE_18107_REPRODUCED: turn-1:reply incorrectly retained foreign text "FIRST ANSWER" from turn-0:reply',
    );
    process.exitCode = 1;
    return;
  }

  assert.equal(mismatchedIdResult.id, 'turn-1:reply');
  assert.deepEqual(resumedTexts, ['RESUMED-TEXT']);
  assert.equal(firstAnswerOccurrences, 1);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
