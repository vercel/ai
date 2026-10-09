import {
  AbstractChat,
  type ChatState,
  type ChatStatus,
  DefaultChatTransport,
  type UIMessage,
  type UIMessageChunk,
} from 'ai';

class InMemoryChatState implements ChatState<UIMessage> {
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
  constructor(transport: DefaultChatTransport<UIMessage>) {
    let id = 0;
    super({
      id: 'chat-14688',
      generateId: () => `local-${++id}`,
      state: new InMemoryChatState(),
      transport,
    });
  }
}

class ReplayAwareDefaultChatTransport extends DefaultChatTransport<UIMessage> {
  readonly resumeStreamIsReplay = true;
}

const encoder = new TextEncoder();

function formatChunk(chunk: UIMessageChunk) {
  return encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`);
}

function interruptedResponse(chunks: UIMessageChunk[]) {
  let index = 0;

  return new Response(
    new ReadableStream<Uint8Array>({
      pull(controller) {
        if (index < chunks.length) {
          controller.enqueue(formatChunk(chunks[index++]));
        } else {
          controller.error(new TypeError('network connection lost'));
        }
      },
    }),
  );
}

function completeResponse(chunks: UIMessageChunk[]) {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(formatChunk(chunk));
        }
        controller.close();
      },
    }),
  );
}

async function main() {
  const replayAware = process.env.REPLAY_AWARE === '1';
  const initialChunks: UIMessageChunk[] = [
    { type: 'start', messageId: 'msg-123' },
    { type: 'start-step' },
    { type: 'reasoning-start', id: 'reasoning-1' },
    {
      type: 'reasoning-delta',
      id: 'reasoning-1',
      delta: 'thinking',
    },
    { type: 'text-start', id: 'text-1' },
    { type: 'text-delta', id: 'text-1', delta: 'Hello, ' },
  ];

  const replayedChunks: UIMessageChunk[] = [
    { type: 'start', messageId: 'msg-123' },
    { type: 'start-step' },
    { type: 'reasoning-start', id: 'reasoning-1' },
    {
      type: 'reasoning-delta',
      id: 'reasoning-1',
      delta: 'thinking...',
    },
    { type: 'reasoning-end', id: 'reasoning-1' },
    { type: 'text-start', id: 'text-1' },
    { type: 'text-delta', id: 'text-1', delta: 'Hello, ' },
    { type: 'text-delta', id: 'text-1', delta: 'world!' },
    { type: 'text-end', id: 'text-1' },
    { type: 'finish-step' },
    { type: 'finish', finishReason: 'stop' },
  ];

  const Transport = replayAware
    ? ReplayAwareDefaultChatTransport
    : DefaultChatTransport<UIMessage>;
  const transport = new Transport({
    api: 'https://example.test/api/chat',
    fetch: async (_input, init) =>
      init?.method === 'GET'
        ? completeResponse(replayedChunks)
        : interruptedResponse(initialChunks),
  });

  const chat = new ReproductionChat(transport);

  await chat.sendMessage({ text: 'Hello' });

  if (chat.status !== 'error') {
    throw new Error('Expected the initial network interruption');
  }

  chat.clearError();
  await chat.resumeStream();

  const assistantMessage = chat.messages.at(-1);
  if (assistantMessage?.role !== 'assistant') {
    throw new Error('Expected a resumed assistant message');
  }

  const textParts = assistantMessage.parts.filter(part => part.type === 'text');
  const reasoningParts = assistantMessage.parts.filter(
    part => part.type === 'reasoning',
  );

  if (textParts.length > 1 || reasoningParts.length > 1) {
    console.error(
      `Observed resumed part counts: text=${textParts.length}, reasoning=${reasoningParts.length}`,
    );
    throw new Error(
      'ISSUE_14688_REPRODUCED: resumeStream duplicated persisted text/reasoning parts',
    );
  }

  if (
    textParts.length !== 1 ||
    reasoningParts.length !== 1 ||
    textParts[0].text !== 'Hello, world!' ||
    reasoningParts[0].text !== 'thinking...'
  ) {
    throw new Error(
      'Resumed message did not contain the expected final content',
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
