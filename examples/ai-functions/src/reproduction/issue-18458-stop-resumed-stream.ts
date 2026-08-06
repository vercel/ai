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
  writeCount = 0;

  constructor(public messages: UIMessage[]) {}

  pushMessage = (message: UIMessage) => {
    this.messages = [...this.messages, message];
    this.writeCount++;
  };

  popMessage = () => {
    this.messages = this.messages.slice(0, -1);
    this.writeCount++;
  };

  replaceMessage = (index: number, message: UIMessage) => {
    this.messages = this.messages.map((current, currentIndex) =>
      currentIndex === index ? message : current,
    );
    this.writeCount++;
  };

  snapshot = <T>(value: T): T => structuredClone(value);
}

class Chat extends AbstractChat<UIMessage> {}

function slowStream({
  chunks,
  intervalMs,
  abortSignal,
}: {
  chunks: UIMessageChunk[];
  intervalMs: number;
  abortSignal?: AbortSignal;
}) {
  let index = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  let removeAbortListener = () => {};

  const cleanup = () => {
    if (timer != null) {
      clearInterval(timer);
      timer = undefined;
    }
    removeAbortListener();
  };

  return new ReadableStream<UIMessageChunk>({
    start(controller) {
      const abort = () => {
        cleanup();
        controller.error(new DOMException('Aborted', 'AbortError'));
      };

      if (abortSignal?.aborted) {
        abort();
        return;
      }

      abortSignal?.addEventListener('abort', abort, { once: true });
      removeAbortListener = () =>
        abortSignal?.removeEventListener('abort', abort);

      timer = setInterval(() => {
        if (index >= chunks.length) {
          cleanup();
          controller.close();
          return;
        }

        controller.enqueue(chunks[index++]);
      }, intervalMs);
    },
    cancel() {
      cleanup();
    },
  });
}

function lastText(state: State) {
  const textPart = state.messages
    .at(-1)
    ?.parts.find(part => part.type === 'text');
  return textPart?.type === 'text' ? textPart.text : '';
}

async function waitForText(state: State, expected: string) {
  const deadline = Date.now() + 2_000;

  while (!lastText(state).includes(expected)) {
    if (Date.now() >= deadline) {
      throw new Error(`Timed out waiting for resumed text ${expected}`);
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

  let reconnectHadAbortSignal = false;
  const transport: ChatTransport<UIMessage> = {
    sendMessages: async () =>
      new ReadableStream({
        start(controller) {
          controller.close();
        },
      }),
    reconnectToStream: async options => {
      const abortSignal = (
        options as typeof options & { abortSignal?: AbortSignal }
      ).abortSignal;
      reconnectHadAbortSignal = abortSignal != null;

      return slowStream({
        chunks: [
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
        ],
        intervalMs: 5,
        abortSignal,
      });
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

  const textWhenStopResolved = lastText(state);
  const writesWhenStopResolved = state.writeCount;
  await chat.stop();
  await done;

  const textAfterStreamEnded = lastText(state);
  const postStopWrites = state.writeCount - writesWhenStopResolved;

  console.log(
    'text when stop() resolved:',
    JSON.stringify(textWhenStopResolved),
  );
  console.log(
    'text after stream ended:   ',
    JSON.stringify(textAfterStreamEnded),
  );
  console.log('post-stop state writes:    ', postStopWrites);
  console.log('reconnect received signal: ', reconnectHadAbortSignal);

  if (textAfterStreamEnded !== textWhenStopResolved) {
    console.error(
      'REPRODUCED: resumed stream mutated chat state after stop() resolved',
    );
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
