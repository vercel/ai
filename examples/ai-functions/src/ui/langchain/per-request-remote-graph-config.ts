import { LangSmithDeploymentTransport } from '@ai-sdk/langchain';
import type { UIMessage } from 'ai';

const calls: unknown[] = [];

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
      async stream(_input: unknown, options: unknown) {
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

for (const [chatId, threadId] of [
  ['chat-a', 'thread-a'],
  ['chat-b', 'thread-b'],
] as const) {
  await transport.sendMessages({
    trigger: 'submit-message',
    chatId,
    messageId: undefined,
    messages,
    abortSignal: undefined,
    body: { threadId },
  });
}

console.log(JSON.stringify(calls, null, 2));
