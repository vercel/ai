import assert from 'node:assert/strict';
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
  messages: UIMessage[];

  constructor(messages: UIMessage[]) {
    this.messages = messages;
  }

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

class ReproductionChat extends AbstractChat<UIMessage> {
  constructor(init: ChatInit<UIMessage>) {
    super({
      ...init,
      state: new ReproductionChatState(init.messages ?? []),
    });
  }
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

  let request:
    | Parameters<ChatTransport<UIMessage>['sendMessages']>[0]
    | undefined;

  const chunks: UIMessageChunk[] = [
    { type: 'start' },
    { type: 'text-start', id: 'text-1' },
    {
      type: 'text-delta',
      id: 'text-1',
      delta: 'regenerated target',
    },
    { type: 'text-end', id: 'text-1' },
    { type: 'finish', finishReason: 'stop' },
  ];

  const transport: ChatTransport<UIMessage> = {
    async sendMessages(options) {
      request = {
        ...options,
        messages: structuredClone(options.messages),
      };

      return new ReadableStream<UIMessageChunk>({
        start(controller) {
          for (const chunk of chunks) {
            controller.enqueue(chunk);
          }
          controller.close();
        },
      });
    },
    async reconnectToStream() {
      return null;
    },
  };

  const chat = new ReproductionChat({
    id: 'chat-123',
    generateId: () => 'id-0',
    messages: structuredClone(initialMessages),
    transport,
  });

  await chat.regenerate({ messageId: 'assistant-target' });

  assert.ok(request, 'transport request was not sent');
  assert.equal(request.trigger, 'regenerate-message');
  assert.equal(request.messageId, 'assistant-target');
  assert.deepEqual(request.messages, initialMessages.slice(0, 2));

  const expectedMessages: UIMessage[] = [
    initialMessages[0],
    initialMessages[1],
    {
      id: 'id-0',
      role: 'assistant',
      parts: [{ type: 'text', text: 'regenerated target' }],
    },
  ];

  if (
    chat.messages.length === 2 &&
    chat.messages[1]?.id === 'assistant-parent' &&
    chat.messages[1]?.parts.some(
      part =>
        part.type === 'text' &&
        part.text.includes('parent') &&
        chat.messages[1]?.parts.some(
          candidate =>
            candidate.type === 'text' &&
            candidate.text.includes('regenerated target'),
        ),
    )
  ) {
    throw new Error(
      "ISSUE_18318_REPRODUCED: regenerate merged B' into assistant-parent; expected [U, A, B'] but received [U, A + B']",
    );
  }

  assert.deepEqual(chat.messages, expectedMessages);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
