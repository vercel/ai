import assert from 'node:assert/strict';
import {
  AbstractChat,
  type ChatState,
  type ChatStatus,
  type ChatTransport,
  type UIMessage,
  type UIMessageChunk,
} from 'ai';

const failureSignal =
  'ISSUE_21916_REPRODUCED: resumeStream did not apply the approved tool output to the existing assistant message';

class InMemoryChatState implements ChatState<UIMessage> {
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

class ReproductionChat extends AbstractChat<UIMessage> {}

async function main() {
  const chunks: UIMessageChunk[] = [
    {
      type: 'tool-output-available',
      toolCallId: 'call-1',
      output: { price: 12 },
    },
    { type: 'text-start', id: 'text-1' },
    { type: 'text-delta', id: 'text-1', delta: 'Updated.' },
    { type: 'text-end', id: 'text-1' },
    { type: 'finish' },
  ];

  const transport: ChatTransport<UIMessage> = {
    sendMessages: async () => {
      throw new Error('sendMessages is not used by this reproduction');
    },
    reconnectToStream: async () =>
      new ReadableStream<UIMessageChunk>({
        start(controller) {
          for (const chunk of chunks) {
            controller.enqueue(chunk);
          }
          controller.close();
        },
      }),
  };

  const chat = new ReproductionChat({
    id: 'chat-1',
    transport,
    state: new InMemoryChatState([
      {
        id: 'user-1',
        role: 'user',
        parts: [{ type: 'text', text: 'Set the price to 12' }],
      },
      {
        id: 'assistant-1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-update_product',
            toolCallId: 'call-1',
            state: 'approval-responded',
            input: { id: 'product-1', price: 12 },
            approval: { id: 'approval-1', approved: true },
          },
        ],
      },
    ]),
  });

  await chat.resumeStream();

  const lastMessage = chat.messages.at(-1);
  const toolPart = lastMessage?.parts.find(
    part => part.type === 'tool-update_product',
  );
  const textPart = lastMessage?.parts.find(part => part.type === 'text');

  assert.deepEqual(
    {
      error: chat.error?.message,
      status: chat.status,
      messageCount: chat.messages.length,
      lastMessageId: lastMessage?.id,
      tool:
        toolPart?.type === 'tool-update_product'
          ? {
              state: toolPart.state,
              output:
                toolPart.state === 'output-available'
                  ? toolPart.output
                  : undefined,
            }
          : undefined,
      text:
        textPart?.type === 'text'
          ? { state: textPart.state, text: textPart.text }
          : undefined,
    },
    {
      error: undefined,
      status: 'ready',
      messageCount: 2,
      lastMessageId: 'assistant-1',
      tool: {
        state: 'output-available',
        output: { price: 12 },
      },
      text: { state: 'done', text: 'Updated.' },
    },
    failureSignal,
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
