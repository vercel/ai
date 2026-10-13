import { LangSmithDeploymentTransport } from '@ai-sdk/langchain';
import type { RunnableConfig } from '@langchain/core/runnables';
import type { UIMessage } from 'ai';

const calls: Array<
  RunnableConfig & {
    streamMode?: string[];
  }
> = [];

class ExampleLangSmithDeploymentTransport extends LangSmithDeploymentTransport<UIMessage> {
  constructor() {
    super({
      url: 'https://example.invalid',
      prepareRemoteGraphConfig: ({ chatId, body }) => ({
        configurable: {
          thread_id:
            (body as { threadId?: string } | undefined)?.threadId ?? chatId,
        },
        metadata: { chatId },
        tags: ['ai-sdk-chat'],
      }),
    });

    // Replace the network boundary so this example can run without a deployment.
    this.graph = {
      async stream(
        _input: unknown,
        options: RunnableConfig & { streamMode?: string[] },
      ) {
        calls.push(options);
        return (async function* () {})();
      },
    } as unknown as typeof this.graph;
  }
}

const transport = new ExampleLangSmithDeploymentTransport();
const messages: UIMessage[] = [
  {
    id: 'user-message',
    role: 'user',
    parts: [{ type: 'text', text: 'Hello' }],
  },
];
const requestSignals: AbortSignal[] = [];

for (const [chatId, threadId] of [
  ['chat-a', 'thread-a'],
  ['chat-b', 'thread-b'],
] as const) {
  const controller = new AbortController();
  requestSignals.push(controller.signal);

  await transport.sendMessages({
    trigger: 'submit-message',
    chatId,
    messageId: undefined,
    messages,
    abortSignal: controller.signal,
    body: { threadId },
  });
}

console.log(
  JSON.stringify(
    calls.map((call, index) => ({
      configurable: call.configurable,
      metadata: call.metadata,
      tags: call.tags,
      streamMode: call.streamMode,
      requestSignalForwarded: call.signal === requestSignals[index],
    })),
    null,
    2,
  ),
);
