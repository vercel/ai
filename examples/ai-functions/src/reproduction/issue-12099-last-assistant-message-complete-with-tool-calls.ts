import {
  AbstractChat,
  lastAssistantMessageIsCompleteWithToolCalls,
  type ChatState,
  type ChatStatus,
  type ChatTransport,
  type UIMessage,
} from 'ai';

class ReproductionChatState implements ChatState<UIMessage> {
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

class ReproductionChat extends AbstractChat<UIMessage> {
  constructor({
    messages,
    transport,
  }: {
    messages: UIMessage[];
    transport: ChatTransport<UIMessage>;
  }) {
    super({
      id: 'issue-12099',
      generateId: () => 'generated-message',
      state: new ReproductionChatState(messages),
      transport,
      sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    });
  }
}

async function main() {
  let endpointCalls = 0;

  const transport: ChatTransport<UIMessage> = {
    async sendMessages() {
      endpointCalls++;
      throw new Error('The chat endpoint should not have been called.');
    },
    async reconnectToStream() {
      return null;
    },
  };

  const chat = new ReproductionChat({
    messages: [
      {
        id: 'assistant-2',
        role: 'assistant',
        parts: [
          { type: 'reasoning', text: 'Searching...' },
          { type: 'step-start' },
          {
            type: 'tool-Docs',
            toolCallId: 'call-1',
            state: 'input-available',
            input: { query: 'some query' },
          },
          { type: 'text', text: 'Prompt is too long' },
        ],
      },
    ],
    transport,
  });

  await chat.addToolOutput({
    tool: 'Docs',
    toolCallId: 'call-1',
    output: { success: true, queryResult: 'huge data result ...' },
  });

  await new Promise(resolve => setTimeout(resolve, 0));

  const helperResult = lastAssistantMessageIsCompleteWithToolCalls({
    messages: chat.messages,
  });

  console.log(
    `lastAssistantMessageIsCompleteWithToolCalls returned: ${helperResult}`,
  );
  console.log(`Automatic chat endpoint calls: ${endpointCalls}`);

  if (endpointCalls !== 0) {
    console.error(
      `BUG REPRODUCED: terminal error text triggered an unexpected automatic chat endpoint call (calls=${endpointCalls})`,
    );
    process.exitCode = 1;
    return;
  }

  console.log('PASS: terminal error text did not resume the chat.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
