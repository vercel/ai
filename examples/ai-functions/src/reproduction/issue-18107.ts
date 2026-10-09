import assert from 'node:assert/strict';
import {
  AbstractChat,
  readUIMessageStream,
  type ChatState,
  type ChatStatus,
  type UIMessage,
  type UIMessageChunk,
} from '../../../../packages/ai/src/index';

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

class ReproductionChat extends AbstractChat<UIMessage> {}

function createResumeStream(messageId: string | undefined) {
  return new ReadableStream<UIMessageChunk>({
    start(controller) {
      controller.enqueue({
        type: 'start',
        ...(messageId == null ? {} : { messageId }),
      });
      controller.enqueue({ type: 'start-step' });
      controller.enqueue({ type: 'text-start', id: 'resumed-text' });
      controller.enqueue({
        type: 'text-delta',
        id: 'resumed-text',
        delta: 'RESUMED-TEXT',
      });
      controller.enqueue({ type: 'text-end', id: 'resumed-text' });
      controller.enqueue({ type: 'finish-step' });
      controller.enqueue({ type: 'finish', finishReason: 'stop' });
      controller.close();
    },
  });
}

function textParts(message: UIMessage | undefined): string[] {
  assert.ok(message, 'Expected an assistant message');
  return message.parts.flatMap(part =>
    part.type === 'text' ? [part.text] : [],
  );
}

async function runChatCase(initialMessages: UIMessage[]) {
  const chat = new ReproductionChat({
    id: 'reproduction-chat',
    state: new ReproductionChatState(initialMessages),
    generateId: () => 'generated-message-id',
    transport: {
      sendMessages: async () => {
        throw new Error('sendMessages is not used by this reproduction');
      },
      reconnectToStream: async () => createResumeStream('turn-1:reply'),
    },
  });

  await chat.resumeStream();
  return chat.messages;
}

async function readFinalMessage({
  message,
  messageId,
}: {
  message: UIMessage;
  messageId: string | undefined;
}) {
  let finalMessage: UIMessage | undefined;

  for await (const snapshot of readUIMessageStream({
    message,
    stream: createResumeStream(messageId),
  })) {
    finalMessage = snapshot;
  }

  assert.ok(finalMessage, 'Expected readUIMessageStream to yield a message');
  return finalMessage;
}

async function main() {
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

  // The three AbstractChat.resumeStream cases from the issue are already fixed
  // on release-v5.0: an empty chat, a completed previous assistant reply, and
  // a chat ending in the resumed turn's user message all append a clean reply.
  const noLocalMessages = await runChatCase([]);
  assert.equal(noLocalMessages.length, 1);
  assert.equal(noLocalMessages[0].id, 'turn-1:reply');
  assert.deepEqual(textParts(noLocalMessages[0]), ['RESUMED-TEXT']);

  const previousAssistantLast = await runChatCase(previousTurn);
  assert.equal(previousAssistantLast.length, 3);
  assert.equal(previousAssistantLast[1].id, 'turn-0:reply');
  assert.deepEqual(textParts(previousAssistantLast[1]), ['FIRST ANSWER']);
  assert.equal(previousAssistantLast[2].id, 'turn-1:reply');
  assert.deepEqual(textParts(previousAssistantLast[2]), ['RESUMED-TEXT']);

  const ownUserMessagePresent = await runChatCase([
    ...previousTurn,
    {
      id: 'turn-1',
      role: 'user',
      parts: [{ type: 'text', text: 'second question' }],
    },
  ]);
  assert.equal(ownUserMessagePresent.length, 4);
  assert.equal(ownUserMessagePresent[3].id, 'turn-1:reply');
  assert.deepEqual(textParts(ownUserMessagePresent[3]), ['RESUMED-TEXT']);

  // The public readUIMessageStream path reported in the issue comments still
  // adopts and renames a foreign assistant seed. Matching IDs and streams
  // without an ID must continue preserving the seed.
  const matchingId = await readFinalMessage({
    message: {
      id: 'turn-1:reply',
      role: 'assistant',
      parts: [{ type: 'text', text: 'PARTIAL-TEXT' }],
    },
    messageId: 'turn-1:reply',
  });
  assert.equal(matchingId.id, 'turn-1:reply');
  assert.deepEqual(textParts(matchingId), ['PARTIAL-TEXT', 'RESUMED-TEXT']);

  const noStreamId = await readFinalMessage({
    message: {
      id: 'turn-1:reply',
      role: 'assistant',
      parts: [{ type: 'text', text: 'PARTIAL-TEXT' }],
    },
    messageId: undefined,
  });
  assert.equal(noStreamId.id, 'turn-1:reply');
  assert.deepEqual(textParts(noStreamId), ['PARTIAL-TEXT', 'RESUMED-TEXT']);

  const mismatchedId = await readFinalMessage({
    message: previousTurn[1],
    messageId: 'turn-1:reply',
  });
  const mismatchedTexts = textParts(mismatchedId);

  if (
    mismatchedId.id === 'turn-1:reply' &&
    mismatchedTexts.length === 2 &&
    mismatchedTexts[0] === 'FIRST ANSWER' &&
    mismatchedTexts[1] === 'RESUMED-TEXT'
  ) {
    console.error(
      'ISSUE_18107_REPRODUCED: turn-1:reply retained foreign text FIRST ANSWER before RESUMED-TEXT',
    );
    process.exitCode = 1;
    return;
  }

  assert.equal(mismatchedId.id, 'turn-1:reply');
  assert.deepEqual(mismatchedTexts, ['RESUMED-TEXT']);
  console.log('Issue #18107 no longer reproduces.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
