import {
  AbstractChat,
  lastAssistantMessageIsCompleteWithToolCalls,
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

  constructor(public messages: UIMessage[] = []) {}

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

  snapshot = <T>(value: T): T => value;
}

class MemoryChat extends AbstractChat<UIMessage> {
  constructor(init: ChatInit<UIMessage>) {
    super({
      ...init,
      state: new MemoryChatState(init.messages),
    });
  }
}

class ToolThenTextTransport implements ChatTransport<UIMessage> {
  readonly requests: UIMessage[][] = [];

  async sendMessages({
    messages,
  }: Parameters<ChatTransport<UIMessage>['sendMessages']>[0]) {
    this.requests.push(structuredClone(messages));

    return streamFromChunks(
      this.requests.length === 1
        ? [
            { type: 'start' },
            { type: 'start-step' },
            {
              type: 'tool-input-available',
              toolCallId: 'weather-call',
              toolName: 'getWeather',
              input: { city: 'San Francisco' },
            },
            { type: 'finish-step' },
            { type: 'finish', finishReason: 'tool-calls' },
          ]
        : [
            { type: 'start' },
            { type: 'start-step' },
            { type: 'text-start', id: 'final-text' },
            {
              type: 'text-delta',
              id: 'final-text',
              delta: 'The weather in San Francisco is 35°C and windy.',
            },
            { type: 'text-end', id: 'final-text' },
            { type: 'finish-step' },
            { type: 'finish', finishReason: 'stop' },
          ],
    );
  }

  async reconnectToStream() {
    return null;
  }
}

function streamFromChunks(chunks: UIMessageChunk[]) {
  return new ReadableStream<UIMessageChunk>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

function getAssistantText(messages: UIMessage[]) {
  return messages
    .filter(message => message.role === 'assistant')
    .flatMap(message => message.parts)
    .filter(part => part.type === 'text')
    .map(part => part.text)
    .join('');
}

async function waitFor(
  condition: () => boolean,
  description: string,
  timeoutMs = 2_000,
) {
  const deadline = Date.now() + timeoutMs;

  while (!condition()) {
    if (Date.now() >= deadline) {
      throw new Error(`Timed out waiting for ${description}`);
    }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

async function runChat({
  automaticResubmission,
}: {
  automaticResubmission: boolean;
}) {
  const transport = new ToolThenTextTransport();
  let id = 0;

  const chat = new MemoryChat({
    id: 'issue-10977',
    generateId: () => `message-${id++}`,
    transport,
    sendAutomaticallyWhen: automaticResubmission
      ? lastAssistantMessageIsCompleteWithToolCalls
      : undefined,
  });

  await chat.sendMessage({
    text: "What's the weather in San Francisco?",
  });

  await chat.addToolOutput({
    tool: 'getWeather',
    toolCallId: 'weather-call',
    output: {
      city: 'San Francisco',
      temperature: 35,
      conditions: 'windy',
    },
  });

  if (automaticResubmission) {
    await waitFor(
      () => transport.requests.length === 2 && chat.status === 'ready',
      'the follow-up request to finish',
    );
  }

  return {
    requestCount: transport.requests.length,
    finalText: getAssistantText(chat.messages),
    secondRequest: transport.requests[1],
  };
}

async function main() {
  const unconfigured = await runChat({ automaticResubmission: false });
  const configured = await runChat({ automaticResubmission: true });

  console.log(
    `without sendAutomaticallyWhen: requests=${unconfigured.requestCount} finalText=${JSON.stringify(unconfigured.finalText)}`,
  );
  console.log(
    `with sendAutomaticallyWhen: requests=${configured.requestCount} finalText=${JSON.stringify(configured.finalText)}`,
  );

  if (unconfigured.requestCount !== 1 || unconfigured.finalText !== '') {
    throw new Error(
      'The unconfigured control did not stop after the tool call.',
    );
  }

  if (
    configured.requestCount !== 2 ||
    configured.finalText !== 'The weather in San Francisco is 35°C and windy.'
  ) {
    throw new Error(
      'Documented client-side tool resubmission did not produce the final assistant message.',
    );
  }

  const submittedToolPart = configured.secondRequest
    ?.at(-1)
    ?.parts.find(part => part.type === 'tool-getWeather');

  if (
    submittedToolPart?.type !== 'tool-getWeather' ||
    submittedToolPart.state !== 'output-available'
  ) {
    throw new Error(
      'The follow-up request did not include the completed frontend tool output.',
    );
  }

  console.log(
    'Issue #10977 could not be reproduced on main with documented client-side resubmission.',
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
