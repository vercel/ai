import type { LanguageModelV3StreamPart } from '@ai-sdk/provider';
import {
  AbstractChat,
  createAgentUIStreamResponse,
  DefaultChatTransport,
  type ChatState,
  type ChatStatus,
  ToolLoopAgent,
  type UIMessage,
  validateUIMessages,
} from 'ai';
import { MockLanguageModelV3 } from 'ai/test';

class ReproductionChatState implements ChatState<UIMessage> {
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

class ReproductionChat extends AbstractChat<UIMessage> {
  constructor({
    transport,
    onError,
  }: {
    transport: DefaultChatTransport<UIMessage>;
    onError: (error: Error) => void;
  }) {
    let nextId = 0;
    super({
      id: 'issue-11444',
      generateId: () => `client-message-${nextId++}`,
      transport,
      state: new ReproductionChatState(),
      onError,
    });
  }
}

function createProviderStream({
  requestNumber,
  abortSignal,
}: {
  requestNumber: number;
  abortSignal?: AbortSignal;
}) {
  return new ReadableStream<LanguageModelV3StreamPart>({
    start(controller) {
      if (requestNumber === 1) {
        const abort = () => {
          controller.error(new DOMException('Aborted', 'AbortError'));
        };

        if (abortSignal?.aborted) {
          abort();
        } else {
          abortSignal?.addEventListener('abort', abort, { once: true });
        }
        return;
      }

      controller.enqueue({ type: 'stream-start', warnings: [] });
      controller.enqueue({ type: 'text-start', id: 'response-text' });
      controller.enqueue({
        type: 'text-delta',
        id: 'response-text',
        delta: 'Follow-up request succeeded.',
      });
      controller.enqueue({ type: 'text-end', id: 'response-text' });
      controller.enqueue({
        type: 'finish',
        finishReason: { unified: 'stop', raw: 'stop' },
        usage: {
          inputTokens: {
            total: 1,
            noCache: 1,
            cacheRead: undefined,
            cacheWrite: undefined,
          },
          outputTokens: {
            total: 1,
            text: 1,
            reasoning: undefined,
          },
        },
      });
      controller.close();
    },
  });
}

async function waitFor(
  condition: () => boolean,
  description: string,
): Promise<void> {
  const deadline = Date.now() + 2_000;

  while (!condition()) {
    if (Date.now() >= deadline) {
      throw new Error(`Timed out waiting for ${description}`);
    }
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}

async function main() {
  let requestNumber = 0;
  const observedErrors: Error[] = [];

  const agent = new ToolLoopAgent({
    model: new MockLanguageModelV3({
      doStream: async ({ abortSignal }) => {
        requestNumber++;
        return {
          stream: createProviderStream({ requestNumber, abortSignal }),
        };
      },
    }),
    tools: {},
  });

  const fetchHandler: typeof fetch = async (_input, init) => {
    const body = (await new Response(init?.body).json()) as {
      messages: UIMessage[];
    };

    return createAgentUIStreamResponse({
      agent,
      uiMessages: body.messages,
      abortSignal: init?.signal ?? undefined,
      generateMessageId: () => `server-assistant-${requestNumber}`,
    });
  };

  const chat = new ReproductionChat({
    transport: new DefaultChatTransport({
      api: 'https://example.test/api/chat',
      fetch: fetchHandler,
    }),
    onError: error => observedErrors.push(error),
  });

  const firstRequest = chat.sendMessage({ text: 'First message' });

  await waitFor(
    () =>
      chat.messages.length === 2 &&
      chat.messages[1].role === 'assistant' &&
      chat.messages[1].parts.length === 0,
    'the empty assistant message created before content arrives',
  );

  await chat.stop();
  await firstRequest;

  const emptyAssistantMessage = chat.messages[1];
  if (
    emptyAssistantMessage?.role !== 'assistant' ||
    emptyAssistantMessage.parts.length !== 0
  ) {
    throw new Error(
      'Setup failed: stopping before content did not retain an empty assistant message.',
    );
  }

  await validateUIMessages({ messages: chat.messages });
  await chat.sendMessage({ text: 'Second message' });

  const followUpText = chat.messages
    .at(-1)
    ?.parts.find(part => part.type === 'text');

  if (observedErrors.length > 0 || chat.error != null) {
    const error = observedErrors[0] ?? chat.error;
    throw new Error(
      `Unexpected validation error after stop: ${error?.message ?? 'unknown error'}`,
    );
  }

  if (
    followUpText?.type !== 'text' ||
    followUpText.text !== 'Follow-up request succeeded.'
  ) {
    throw new Error(
      'Follow-up request did not complete after the empty assistant message.',
    );
  }

  console.log(
    'PASS: stopping before assistant content retained empty parts, validation succeeded, and createAgentUIStreamResponse handled the follow-up request.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
