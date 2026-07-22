import {
  AbstractChat,
  type ChatState,
  type ChatStatus,
  type ChatTransport,
  type UIMessage,
  type UIMessageChunk,
  jsonSchema,
  lastAssistantMessageIsCompleteWithToolCalls,
  stepCountIs,
  streamText,
} from '../../../../packages/ai/src/index';
import { MockLanguageModelV2 } from '../../../../packages/ai/src/test/mock-language-model-v2';

const usage = {
  inputTokens: 3,
  outputTokens: 5,
  totalTokens: 8,
  reasoningTokens: undefined,
  cachedInputTokens: undefined,
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function streamFrom<T>(chunks: T[]): ReadableStream<T> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

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
    this.messages = [
      ...this.messages.slice(0, index),
      message,
      ...this.messages.slice(index + 1),
    ];
  };

  snapshot = <T>(value: T): T => structuredClone(value);
}

class TestChat extends AbstractChat<UIMessage> {
  constructor(options: {
    transport: ChatTransport<UIMessage>;
    sendAutomaticallyWhen?: (options: {
      messages: UIMessage[];
    }) => boolean | PromiseLike<boolean>;
  }) {
    let id = 0;
    super({
      id: 'issue-10977',
      generateId: () => `message-${id++}`,
      state: new MemoryChatState(),
      ...options,
    });
  }
}

class ToolThenTextTransport implements ChatTransport<UIMessage> {
  calls: UIMessage[][] = [];

  async sendMessages({
    messages,
  }: Parameters<ChatTransport<UIMessage>['sendMessages']>[0]) {
    this.calls.push(structuredClone(messages));

    if (this.calls.length === 1) {
      return streamFrom<UIMessageChunk>([
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
      ]);
    }

    if (this.calls.length === 2) {
      return streamFrom<UIMessageChunk>([
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
      ]);
    }

    throw new Error(`Unexpected transport call ${this.calls.length}`);
  }

  async reconnectToStream() {
    return null;
  }
}

function getText(messages: UIMessage[]) {
  return messages
    .filter(message => message.role === 'assistant')
    .flatMap(message => message.parts)
    .filter(part => part.type === 'text')
    .map(part => part.text)
    .join('');
}

async function waitFor(
  predicate: () => boolean,
  description: string,
  timeoutMs = 1_000,
) {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`Timed out waiting for ${description}`);
    }
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}

async function verifyStopWhenCannotExecuteAFrontendTool() {
  const model = new MockLanguageModelV2({
    doStream: async () => ({
      stream: streamFrom([
        {
          type: 'tool-call' as const,
          id: 'weather-call',
          toolCallId: 'weather-call',
          toolName: 'getWeather',
          input: '{"city":"San Francisco"}',
        },
        {
          type: 'finish' as const,
          finishReason: 'tool-calls' as const,
          usage,
        },
      ]),
    }),
  });

  const result = streamText({
    model,
    prompt: "What's the weather in San Francisco?",
    tools: {
      getWeather: {
        inputSchema: jsonSchema({
          type: 'object',
          properties: { city: { type: 'string' } },
          required: ['city'],
          additionalProperties: false,
        }),
      },
    },
    stopWhen: stepCountIs(5),
  });

  await result.consumeStream();

  assert(
    model.doStreamCalls.length === 1,
    'stopWhen unexpectedly caused a second server-side model call without a tool output',
  );
  assert(
    (await result.steps).length === 1,
    'stopWhen unexpectedly created another server-side step without a tool output',
  );
}

async function runClientToolScenario(sendAutomatically: boolean) {
  const transport = new ToolThenTextTransport();
  const chat = new TestChat({
    transport,
    ...(sendAutomatically
      ? {
          sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
        }
      : {}),
  });

  await chat.sendMessage({
    text: "What's the weather in San Francisco?",
  });
  await chat.addToolOutput({
    tool: 'getWeather' as never,
    toolCallId: 'weather-call',
    output: {
      city: 'San Francisco',
      temperature: 35,
      condition: 'Windy',
    } as never,
  });

  if (sendAutomatically) {
    await waitFor(
      () => transport.calls.length === 2 && chat.status === 'ready',
      'the automatic tool-result submission and final response',
    );
  } else {
    await new Promise(resolve => setTimeout(resolve, 20));
  }

  return {
    requestCount: transport.calls.length,
    finalText: getText(chat.messages),
    secondRequest: transport.calls[1],
  };
}

async function main() {
  await verifyStopWhenCannotExecuteAFrontendTool();

  const reportedConfiguration = await runClientToolScenario(false);
  assert(
    reportedConfiguration.requestCount === 1,
    'The configuration without sendAutomaticallyWhen unexpectedly made a second request',
  );
  assert(
    reportedConfiguration.finalText === '',
    'The configuration without sendAutomaticallyWhen unexpectedly produced final text',
  );

  const supportedV5Configuration = await runClientToolScenario(true);
  assert(
    supportedV5Configuration.requestCount === 2,
    'The documented AI SDK v5 configuration did not make the tool-result request',
  );
  assert(
    supportedV5Configuration.finalText ===
      'The weather in San Francisco is 35°C and windy.',
    'The documented AI SDK v5 configuration did not produce the final assistant message',
  );
  assert(
    supportedV5Configuration.secondRequest?.some(message =>
      message.parts.some(
        part =>
          part.type === 'tool-getWeather' && part.state === 'output-available',
      ),
    ),
    'The second request did not include the completed frontend tool output',
  );

  console.log(
    `without sendAutomaticallyWhen: requests=${reportedConfiguration.requestCount}, finalText=${JSON.stringify(reportedConfiguration.finalText)}`,
  );
  console.log(
    `with sendAutomaticallyWhen: requests=${supportedV5Configuration.requestCount}, finalText=${JSON.stringify(supportedV5Configuration.finalText)}`,
  );
  console.log(
    'PASS: the documented AI SDK v5 client-tool configuration submits the tool output and receives a final assistant message.',
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
