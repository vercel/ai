import {
  AbstractChat,
  type ChatState,
  type ChatStatus,
  type ChatTransport,
  type UIMessage,
  type UIMessageChunk,
} from 'ai';

class State implements ChatState<UIMessage> {
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
    this.messages = this.messages.map((current, currentIndex) =>
      currentIndex === index ? message : current,
    );
  };

  snapshot = <T>(value: T): T => structuredClone(value);
}

class Chat extends AbstractChat<UIMessage> {}

function slowStream(
  chunks: UIMessageChunk[],
  intervalMs: number,
): ReadableStream<UIMessageChunk> {
  let index = 0;

  return new ReadableStream<UIMessageChunk>({
    async pull(controller) {
      if (index >= chunks.length) {
        controller.close();
        return;
      }

      await new Promise(resolve => setTimeout(resolve, intervalMs));
      controller.enqueue(chunks[index++]);
    },
  });
}

function lastText(state: State): string {
  const textPart = state.messages
    .at(-1)
    ?.parts.find(part => part.type === 'text');

  return textPart?.type === 'text' ? textPart.text : '';
}

async function waitForText(state: State, expected: string): Promise<void> {
  const deadline = Date.now() + 2_000;

  while (lastText(state) !== expected) {
    if (Date.now() > deadline) {
      throw new Error(`Reproduction setup timed out waiting for ${expected}`);
    }

    await new Promise(resolve => setTimeout(resolve, 1));
  }
}

async function main() {
  const state = new State([
    {
      id: 'u1',
      role: 'user',
      parts: [{ type: 'text', text: 'count to 30' }],
    },
  ]);

  const chunks: UIMessageChunk[] = [
    { type: 'start', messageId: 'server-msg-1' },
    { type: 'text-start', id: 't1' },
    ...Array.from(
      { length: 30 },
      (_, index): UIMessageChunk => ({
        type: 'text-delta',
        id: 't1',
        delta: `${index} `,
      }),
    ),
    { type: 'text-end', id: 't1' },
    { type: 'finish', finishReason: 'stop' },
  ];

  let reconnectAbortSignal: AbortSignal | undefined;
  const transport: ChatTransport<UIMessage> = {
    sendMessages: async () => slowStream([], 0),
    reconnectToStream: async options => {
      reconnectAbortSignal = (
        options as typeof options & { abortSignal?: AbortSignal }
      ).abortSignal;
      return slowStream(chunks, 5);
    },
  };

  const chat = new Chat({
    id: 'c1',
    state,
    transport,
    generateId: () => 'client-generated',
  });

  const done = chat.resumeStream();
  await waitForText(state, '0 1 2 ');

  await chat.stop();
  const textAfterStopResolved = lastText(state);

  await done;
  const textAfterStreamEnded = lastText(state);

  console.log(
    'text after stop() resolved:',
    JSON.stringify(textAfterStopResolved),
  );
  console.log(
    'text after stream ended:   ',
    JSON.stringify(textAfterStreamEnded),
  );
  console.log(
    'reconnect received abort signal:',
    reconnectAbortSignal !== undefined,
  );

  if (textAfterStreamEnded !== textAfterStopResolved) {
    throw new Error(
      'ISSUE 18458 REPRODUCED: resumed stream updated chat state after stop() resolved',
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
