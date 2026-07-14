import assert from 'node:assert/strict';
import {
  AbstractChat,
  type ChatInit,
  type ChatState,
  type ChatStatus,
  type ChatTransport,
  type UIMessage,
  type UIMessageChunk,
} from 'ai-v5-0-80';
import { Schema } from 'effect-v3-18-4';

type MessageMetadata = {
  model: string;
};

type Message = UIMessage<MessageMetadata>;

class MemoryChatState implements ChatState<Message> {
  status: ChatStatus = 'ready';
  error: Error | undefined;
  messages: Message[] = [];

  pushMessage = (message: Message) => {
    this.messages.push(message);
  };

  popMessage = () => {
    this.messages.pop();
  };

  replaceMessage = (index: number, message: Message) => {
    this.messages[index] = structuredClone(message);
  };

  snapshot = <T>(value: T): T => structuredClone(value);
}

class TestChat extends AbstractChat<Message> {
  constructor(init: ChatInit<Message>) {
    super({
      ...init,
      state: new MemoryChatState(),
    });
  }
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

async function main() {
  const metadataSchema = Schema.standardSchemaV1(
    Schema.Struct({
      model: Schema.String,
    }),
  );

  const transport: ChatTransport<Message> = {
    async sendMessages() {
      return createStream([
        {
          type: 'start',
          messageId: 'assistant-message',
          messageMetadata: { model: 'test-model' },
        },
        { type: 'start-step' },
        { type: 'finish-step' },
        { type: 'finish' },
      ]);
    },
    async reconnectToStream() {
      return null;
    },
  };

  const chat = new TestChat({
    id: 'issue-9934',
    generateId: () => 'user-message',
    messageMetadataSchema: metadataSchema,
    transport,
  });

  await chat.sendMessage({ text: 'hello' });

  assert.equal(
    chat.status,
    'ready',
    `Expected valid Effect message metadata to be accepted, but chat failed with: ${chat.error?.message}`,
  );
  assert.equal(chat.error, undefined);
  assert.deepEqual(chat.lastMessage?.metadata, { model: 'test-model' });
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
