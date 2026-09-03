import assert from 'node:assert/strict';
import {
  AbstractChat,
  type ChatState,
  type ChatStatus,
  type ChatTransport,
  type UIMessage,
} from '../../../../packages/ai/src/index';

class MemoryChatState implements ChatState<UIMessage> {
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

class MemoryChat extends AbstractChat<UIMessage> {}

function getDynamicToolPart(messages: UIMessage[]) {
  const part = messages
    .at(-1)
    ?.parts.find(part => part.type === 'dynamic-tool');

  assert.ok(part, 'Expected the MCP-style dynamic tool part to remain present');
  return part;
}

async function main() {
  let submittedMessages: UIMessage[] | undefined;

  const transport: ChatTransport<UIMessage> = {
    async sendMessages({ messages }) {
      submittedMessages = structuredClone(messages);

      return new ReadableStream({
        start(controller) {
          controller.enqueue({ type: 'start' });
          controller.enqueue({ type: 'finish', finishReason: 'stop' });
          controller.close();
        },
      });
    },
    async reconnectToStream() {
      return null;
    },
  };

  const chat = new MemoryChat({
    id: 'issue-7868',
    state: new MemoryChatState([
      {
        id: 'user-1',
        role: 'user',
        parts: [{ type: 'text', text: 'Run the MCP tool' }],
      },
      {
        id: 'assistant-1',
        role: 'assistant',
        parts: [
          {
            type: 'dynamic-tool',
            toolName: 'mcpTool',
            toolCallId: 'tool-call-1',
            state: 'input-available',
            input: { action: 'confirmed' },
          },
        ],
      },
    ]),
    transport,
  });

  await chat.addToolResult({
    tool: 'mcpTool',
    toolCallId: 'tool-call-1',
    output: { approved: true },
  });

  const updatedPart = getDynamicToolPart(chat.messages);
  assert.equal(updatedPart.state, 'output-available');
  assert.deepEqual(updatedPart.output, { approved: true });

  await chat.sendMessage();

  assert.ok(submittedMessages, 'Expected sendMessage() to submit the chat');
  const submittedPart = getDynamicToolPart(submittedMessages);
  assert.equal(submittedPart.state, 'output-available');
  assert.deepEqual(submittedPart.output, { approved: true });

  console.log(
    'PASS: addToolResult updated and submitted the dynamic MCP tool output',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
