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
    this.messages = this.messages.map((current, currentIndex) =>
      currentIndex === index ? message : current,
    );
  };

  snapshot = <T>(value: T): T => structuredClone(value);
}

class TestChat extends AbstractChat<UIMessage> {
  constructor(init: ChatInit<UIMessage>) {
    super({ ...init, state: new MemoryChatState() });
  }
}

function stream(chunks: UIMessageChunk[]): ReadableStream<UIMessageChunk> {
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
  const sentMessages: UIMessage[][] = [];
  let requestCount = 0;

  const transport: ChatTransport<UIMessage> = {
    async sendMessages({ messages }) {
      sentMessages.push(structuredClone(messages));
      requestCount++;

      return requestCount === 1
        ? stream([
            { type: 'start' },
            { type: 'start-step' },
            {
              type: 'tool-input-available',
              dynamic: true,
              toolCallId: 'mcp-call-1',
              toolName: 'mcp-confirmed-action',
              input: { action: 'delete-file' },
            },
            { type: 'finish-step' },
            { type: 'finish' },
          ])
        : stream([{ type: 'start' }, { type: 'finish' }]);
    },
    async reconnectToStream() {
      return null;
    },
  };

  const chat = new TestChat({
    id: 'issue-7868',
    generateId: (() => {
      let id = 0;
      return () => `message-${id++}`;
    })(),
    transport,
  });

  await chat.sendMessage({ text: 'Run the MCP action.' });

  const dynamicToolPart = chat.messages
    .at(-1)
    ?.parts.find(part => part.type === 'dynamic-tool');

  assert.ok(dynamicToolPart, 'Expected an MCP-style dynamic-tool UI part');
  assert.equal(dynamicToolPart.state, 'input-available');

  await chat.addToolResult({
    tool: 'mcp-confirmed-action',
    toolCallId: 'mcp-call-1',
    output: { confirmed: true },
  });

  const updatedPart = chat.messages
    .at(-1)
    ?.parts.find(part => part.type === 'dynamic-tool');

  assert.ok(updatedPart, 'Expected the dynamic-tool UI part to remain present');
  assert.equal(
    updatedPart.state,
    'output-available',
    'addToolResult did not update the dynamic-tool state',
  );
  assert.deepEqual(
    updatedPart.output,
    { confirmed: true },
    'addToolResult did not attach the output to the dynamic-tool part',
  );

  await chat.sendMessage();

  const submittedPart = sentMessages[1]
    ?.at(-1)
    ?.parts.find(part => part.type === 'dynamic-tool');

  assert.ok(
    submittedPart,
    'sendMessage did not submit the dynamic-tool part after confirmation',
  );
  assert.equal(submittedPart.state, 'output-available');
  assert.deepEqual(submittedPart.output, { confirmed: true });

  console.log(
    'Issue #7868 did not reproduce: addToolResult updated and submitted the dynamic-tool output.',
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
