import {
  AbstractChat,
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
  constructor(transport: ChatTransport<UIMessage>) {
    super({
      id: 'issue-7868',
      generateId: (() => {
        let id = 0;
        return () => `message-${id++}`;
      })(),
      state: new MemoryChatState(),
      transport,
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
  const sentMessages: UIMessage[][] = [];
  let requestCount = 0;

  const transport: ChatTransport<UIMessage> = {
    async sendMessages({ messages }) {
      sentMessages.push(structuredClone(messages));
      requestCount++;

      return requestCount === 1
        ? createStream([
            { type: 'start' },
            { type: 'start-step' },
            {
              type: 'tool-input-available',
              dynamic: true,
              toolCallId: 'mcp-tool-call-1',
              toolName: 'delete-record',
              input: { id: 'record-1' },
            },
            { type: 'finish-step' },
            { type: 'finish', finishReason: 'tool-calls' },
          ])
        : createStream([
            { type: 'start' },
            { type: 'start-step' },
            { type: 'finish-step' },
            { type: 'finish', finishReason: 'stop' },
          ]);
    },
    async reconnectToStream() {
      return null;
    },
  };

  const chat = new MemoryChat(transport);

  await chat.sendMessage({ text: 'Delete record 1 after I confirm.' });

  const pendingPart = chat.messages
    .at(-1)
    ?.parts.find(part => part.type === 'dynamic-tool');

  if (
    pendingPart?.type !== 'dynamic-tool' ||
    pendingPart.toolCallId !== 'mcp-tool-call-1' ||
    pendingPart.state !== 'input-available'
  ) {
    throw new Error('Expected an input-available dynamic MCP tool call.');
  }

  await chat.addToolResult({
    tool: 'delete-record',
    toolCallId: 'mcp-tool-call-1',
    output: { confirmed: true },
  });

  const updatedPart = chat.messages
    .at(-1)
    ?.parts.find(part => part.type === 'dynamic-tool');

  if (
    updatedPart?.type !== 'dynamic-tool' ||
    updatedPart.state !== 'output-available' ||
    updatedPart.output == null ||
    typeof updatedPart.output !== 'object' ||
    !('confirmed' in updatedPart.output) ||
    updatedPart.output.confirmed !== true
  ) {
    throw new Error(
      'Issue #7868 reproduced: addToolResult left the dynamic MCP tool call unchanged.',
    );
  }

  await chat.sendMessage();

  const submittedPart = sentMessages[1]
    ?.at(-1)
    ?.parts.find(part => part.type === 'dynamic-tool');

  if (
    submittedPart?.type !== 'dynamic-tool' ||
    submittedPart.state !== 'output-available' ||
    submittedPart.output == null ||
    typeof submittedPart.output !== 'object' ||
    !('confirmed' in submittedPart.output) ||
    submittedPart.output.confirmed !== true
  ) {
    throw new Error(
      'Issue #7868 reproduced: sendMessage omitted the dynamic MCP tool result.',
    );
  }

  console.log(
    JSON.stringify(
      {
        partType: updatedPart.type,
        localStateAfterAddToolResult: updatedPart.state,
        localOutputAfterAddToolResult: updatedPart.output,
        submittedState: submittedPart.state,
        submittedOutput: submittedPart.output,
      },
      null,
      2,
    ),
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
