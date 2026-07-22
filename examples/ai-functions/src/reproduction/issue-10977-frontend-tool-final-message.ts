import {
  AbstractChat,
  type ChatInit,
  type ChatState,
  type ChatStatus,
  type ChatTransport,
  convertToModelMessages,
  isTextUIPart,
  isToolUIPart,
  lastAssistantMessageIsCompleteWithToolCalls,
  simulateReadableStream,
  stepCountIs,
  streamText,
  tool,
  type UIMessage,
} from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import { z } from 'zod';

const finalAnswer = 'San Francisco is 35°C and windy.';

const usage = {
  inputTokens: {
    total: 10,
    noCache: 10,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: {
    total: 5,
    text: 5,
    reasoning: undefined,
  },
};

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

  snapshot = <T>(value: T): T => value;
}

class MemoryChat extends AbstractChat<UIMessage> {
  constructor(init: ChatInit<UIMessage>) {
    super({ ...init, state: new MemoryChatState() });
  }
}

class LocalRouteTransport implements ChatTransport<UIMessage> {
  requestCount = 0;
  modelCallCount = 0;

  private readonly model = new MockLanguageModelV3({
    doStream: async () => {
      this.modelCallCount++;

      if (this.modelCallCount === 1) {
        return {
          stream: simulateReadableStream({
            chunks: [
              {
                type: 'tool-call',
                toolCallId: 'weather-call',
                toolName: 'getWeather',
                input: JSON.stringify({ location: 'San Francisco' }),
              },
              {
                type: 'finish',
                finishReason: {
                  unified: 'tool-calls' as const,
                  raw: 'tool-calls',
                },
                usage,
              },
            ],
          }),
        };
      }

      return {
        stream: simulateReadableStream({
          chunks: [
            { type: 'text-start', id: 'final-text' },
            {
              type: 'text-delta',
              id: 'final-text',
              delta: finalAnswer,
            },
            { type: 'text-end', id: 'final-text' },
            {
              type: 'finish',
              finishReason: { unified: 'stop' as const, raw: 'stop' },
              usage,
            },
          ],
        }),
      };
    },
  });

  sendMessages: ChatTransport<UIMessage>['sendMessages'] = async ({
    messages,
  }) => {
    this.requestCount++;

    const result = streamText({
      model: this.model,
      messages: await convertToModelMessages(messages),
      tools: {
        getWeather: tool({
          description: 'Get the weather for a location.',
          inputSchema: z.object({ location: z.string() }),
        }),
      },
      // This matches the attempted server-side fix from the issue comments.
      // It cannot continue a frontend tool until the browser sends its result.
      stopWhen: stepCountIs(5),
    });

    return result.toUIMessageStream({ originalMessages: messages });
  };

  reconnectToStream: ChatTransport<UIMessage>['reconnectToStream'] = async () =>
    null;
}

async function waitFor(
  condition: () => boolean,
  description: string,
  timeoutMs = 2_000,
) {
  const deadline = Date.now() + timeoutMs;

  while (!condition()) {
    if (Date.now() >= deadline) {
      throw new Error(`Timed out waiting for ${description}.`);
    }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

function getToolCallId(chat: MemoryChat) {
  const toolPart = chat.messages
    .flatMap(message => message.parts)
    .find(isToolUIPart);

  if (toolPart == null) {
    throw new Error('Expected the first response to contain a tool call.');
  }

  return toolPart.toolCallId;
}

function getFinalText(chat: MemoryChat) {
  return chat.messages
    .filter(message => message.role === 'assistant')
    .flatMap(message => message.parts)
    .filter(isTextUIPart)
    .map(part => part.text)
    .join('');
}

async function runScenario(sendAutomatically: boolean) {
  const transport = new LocalRouteTransport();
  const chat = new MemoryChat({
    transport,
    sendAutomaticallyWhen: sendAutomatically
      ? lastAssistantMessageIsCompleteWithToolCalls
      : undefined,
  });

  await chat.sendMessage({ text: "What's the weather in San Francisco?" });
  await chat.addToolOutput({
    tool: 'getWeather',
    toolCallId: getToolCallId(chat),
    output: {
      location: 'San Francisco',
      temperature: 35,
      conditions: 'Windy',
    },
  });

  if (sendAutomatically) {
    await waitFor(
      () =>
        transport.requestCount === 2 &&
        chat.status === 'ready' &&
        getFinalText(chat) === finalAnswer,
      'the automatic follow-up request and final assistant message',
    );
  }

  return {
    requestCount: transport.requestCount,
    modelCallCount: transport.modelCallCount,
    finalText: getFinalText(chat),
  };
}

async function main() {
  const reportLike = await runScenario(false);
  const documented = await runScenario(true);

  console.log(
    `report-like configuration: requests=${reportLike.requestCount}, modelCalls=${reportLike.modelCallCount}, finalText=${JSON.stringify(reportLike.finalText || '<none>')}`,
  );
  console.log(
    `documented configuration: requests=${documented.requestCount}, modelCalls=${documented.modelCallCount}, finalText=${JSON.stringify(documented.finalText)}`,
  );

  if (
    reportLike.requestCount !== 1 ||
    reportLike.modelCallCount !== 1 ||
    reportLike.finalText !== ''
  ) {
    throw new Error(
      'Expected the report-like configuration to stop after the frontend tool call.',
    );
  }

  if (
    documented.requestCount !== 2 ||
    documented.modelCallCount !== 2 ||
    documented.finalText !== finalAnswer
  ) {
    throw new Error(
      'Issue #10977 reproduced despite configuring sendAutomaticallyWhen.',
    );
  }

  console.log(
    'Issue #10977 did not reproduce with sendAutomaticallyWhen: the frontend tool result triggered a second request and produced the final assistant message.',
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
