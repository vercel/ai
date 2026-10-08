import assert from 'node:assert/strict';
import {
  AbstractChat,
  type ChatState,
  type ChatStatus,
  type UIDataTypes,
  type UIMessage,
  type UIMessageChunk,
} from 'ai';

type ProductTools = {
  updateProduct: {
    input: { price: number };
    output: { price: number };
  };
};

type ProductMessage = UIMessage<unknown, UIDataTypes, ProductTools>;

class State implements ChatState<ProductMessage> {
  status: ChatStatus = 'ready';
  error: Error | undefined;
  messages: ProductMessage[] = [
    {
      id: 'user-1',
      role: 'user',
      parts: [{ type: 'text', text: 'Update the price.' }],
    },
    {
      id: 'assistant-1',
      role: 'assistant',
      parts: [
        {
          type: 'tool-updateProduct',
          toolCallId: 'call-1',
          state: 'input-available',
          input: { price: 12 },
          providerExecuted: true,
        },
      ],
    },
  ];

  pushMessage = (message: ProductMessage) => {
    this.messages = [...this.messages, message];
  };

  popMessage = () => {
    this.messages = this.messages.slice(0, -1);
  };

  replaceMessage = (index: number, message: ProductMessage) => {
    this.messages = this.messages.map((old, currentIndex) =>
      currentIndex === index ? message : old,
    );
  };

  snapshot = <T>(value: T): T => structuredClone(value);
}

class Chat extends AbstractChat<ProductMessage> {
  constructor() {
    super({
      id: 'chat-1',
      state: new State(),
      transport: {
        sendMessages: async () => {
          throw new Error('Unexpected sendMessages call.');
        },
        reconnectToStream: async () =>
          new ReadableStream<UIMessageChunk>({
            start(controller) {
              controller.enqueue({
                type: 'tool-output-available',
                toolCallId: 'call-1',
                output: { price: 12 },
                providerExecuted: true,
              });
              controller.enqueue({ type: 'finish', finishReason: 'stop' });
              controller.close();
            },
          }),
      },
    });
  }
}

async function main() {
  const chat = new Chat();

  await chat.resumeStream();

  const toolPart = chat.messages
    .at(-1)
    ?.parts.find(part => part.type === 'tool-updateProduct');
  const actual = {
    status: chat.status,
    error: chat.error?.message,
    toolState: toolPart?.state,
    toolOutput:
      toolPart?.state === 'output-available' ? toolPart.output : undefined,
  };

  console.log(actual);

  assert.deepStrictEqual(
    actual,
    {
      status: 'ready',
      error: undefined,
      toolState: 'output-available',
      toolOutput: { price: 12 },
    },
    'ISSUE_22277: resumed provider-executed tool did not reach output-available with ready status',
  );
}

await main();
