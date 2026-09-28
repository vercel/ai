import {
  AbstractChat,
  lastAssistantMessageIsCompleteWithToolCalls,
  type ChatInit,
  type ChatState,
  type ChatStatus,
  type ChatTransport,
  type UIMessage,
  type UIMessageChunk,
} from '../../../../packages/ai';

class ReproductionChatState implements ChatState<UIMessage> {
  status: ChatStatus = 'ready';
  messages: UIMessage[] = [];
  error: Error | undefined;

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
    super({ ...init, state: new ReproductionChatState() });
  }
}

function chunkStream(chunks: UIMessageChunk[]) {
  return new ReadableStream<UIMessageChunk>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

async function main() {
  let requestCount = 0;
  const requests: UIMessage[][] = [];

  const transport: ChatTransport<UIMessage> = {
    async sendMessages({ messages }) {
      requestCount++;
      requests.push(structuredClone(messages));

      if (requestCount === 1) {
        return chunkStream([
          { type: 'start', messageId: 'assistant-2' },
          { type: 'reasoning-start', id: 'reasoning-1' },
          {
            type: 'reasoning-delta',
            id: 'reasoning-1',
            delta: 'Searching...',
          },
          { type: 'reasoning-end', id: 'reasoning-1' },
          { type: 'start-step' },
          {
            type: 'tool-input-available',
            toolCallId: 'call-1',
            toolName: 'Docs',
            input: { query: 'some query' },
          },
          {
            type: 'tool-output-available',
            toolCallId: 'call-1',
            output: {
              success: true,
              queryResult: 'huge data result ...',
            },
          },
          { type: 'text-start', id: 'text-1' },
          {
            type: 'text-delta',
            id: 'text-1',
            delta: 'Prompt is too long',
          },
          { type: 'text-end', id: 'text-1' },
          { type: 'finish-step' },
          { type: 'finish', finishReason: 'error' },
        ]);
      }

      return chunkStream([
        { type: 'start', messageId: 'unexpected-resume' },
        { type: 'start-step' },
        { type: 'text-start', id: 'text-2' },
        {
          type: 'text-delta',
          id: 'text-2',
          delta: 'Unexpected resumed response',
        },
        { type: 'text-end', id: 'text-2' },
        { type: 'finish-step' },
        { type: 'finish', finishReason: 'stop' },
      ]);
    },
    async reconnectToStream() {
      return null;
    },
  };

  let id = 0;
  const chat = new ReproductionChat({
    id: 'issue-12099',
    generateId: () => `generated-${id++}`,
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
  });

  await chat.sendMessage({ text: 'get from docs aws templates' });

  const resumedMessages = requests[1];
  const assistantBeforeResume = resumedMessages?.at(-1);
  const hasCompletedToolOutput = assistantBeforeResume?.parts.some(
    part =>
      part.type === 'tool-Docs' &&
      part.toolCallId === 'call-1' &&
      part.state === 'output-available',
  );
  const hasTerminalErrorText = assistantBeforeResume?.parts.some(
    part => part.type === 'text' && part.text === 'Prompt is too long',
  );

  if (requestCount === 2 && hasCompletedToolOutput && hasTerminalErrorText) {
    console.error(
      'Issue #12099 reproduced: terminal assistant error text triggered an unexpected second chat request.',
    );
    process.exitCode = 1;
    return;
  }

  if (requestCount !== 1) {
    throw new Error(`Expected one chat request, received ${requestCount}.`);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
