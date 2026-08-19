import {
  AbstractChat,
  type ChatInit,
  type ChatState,
  type ChatStatus,
  type UIMessage,
  type UIMessageChunk,
} from 'ai';

class ReproductionState implements ChatState<UIMessage> {
  status: ChatStatus = 'ready';
  error: Error | undefined;
  messages: UIMessage[] = [];

  pushMessage = (message: UIMessage) => {
    this.messages = [...this.messages, structuredClone(message)];
  };

  popMessage = () => {
    this.messages = this.messages.slice(0, -1);
  };

  replaceMessage = (index: number, message: UIMessage) => {
    this.messages = [
      ...this.messages.slice(0, index),
      structuredClone(message),
      ...this.messages.slice(index + 1),
    ];
  };

  snapshot = <T>(value: T): T => structuredClone(value);
}

class ReproductionChat extends AbstractChat<UIMessage> {
  constructor(init: ChatInit<UIMessage>) {
    super({ ...init, state: new ReproductionState() });
  }
}

type StartCase = {
  name: string;
  chunk: UIMessageChunk;
};

type Observation = {
  name: string;
  statusAfterStart: ChatStatus;
  statusAfterContent: ChatStatus;
};

function waitFor(predicate: () => boolean, description: string) {
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timed out waiting for ${description}`));
    }, 2_000);

    const poll = () => {
      if (predicate()) {
        clearTimeout(timeout);
        resolve();
      } else {
        setTimeout(poll, 0);
      }
    };

    poll();
  });
}

async function observeStartCase(testCase: StartCase): Promise<Observation> {
  let controller: ReadableStreamDefaultController<UIMessageChunk>;
  let markProbeProcessed: () => void;
  const probeProcessed = new Promise<void>(resolve => {
    markProbeProcessed = resolve;
  });

  const stream = new ReadableStream<UIMessageChunk>({
    start(streamController) {
      controller = streamController;
    },
  });

  const chat = new ReproductionChat({
    generateId: () => 'generated-id',
    transport: {
      sendMessages: async () => stream,
      reconnectToStream: async () => null,
    },
  });

  const sendPromise = chat.sendMessage({ text: 'Hello' });

  await waitFor(() => chat.status === 'submitted', 'submitted status');
  controller!.enqueue(testCase.chunk);
  controller!.enqueue({
    get type() {
      markProbeProcessed!();
      return 'start-step' as const;
    },
  });

  // UI message chunks are transformed serially. Reading the following
  // start-step chunk proves that the preceding start chunk finished processing
  // without relying on the premature empty-message write reported by the bug.
  await probeProcessed;

  const statusAfterStart = chat.status;

  controller!.enqueue({ type: 'text-start', id: 'text-1' });
  await waitFor(() => chat.status === 'streaming', 'streaming content status');
  const statusAfterContent = chat.status;

  controller!.enqueue({ type: 'text-end', id: 'text-1' });
  controller!.enqueue({ type: 'finish', finishReason: 'stop' });
  controller!.close();
  await sendPromise;

  return {
    name: testCase.name,
    statusAfterStart,
    statusAfterContent,
  };
}

async function main() {
  const observations = await Promise.all([
    observeStartCase({
      name: 'messageId',
      chunk: { type: 'start', messageId: 'response-id' },
    }),
    observeStartCase({
      name: 'messageMetadata',
      chunk: { type: 'start', messageMetadata: { model: 'test-model' } },
    }),
    observeStartCase({
      name: 'no fields',
      chunk: { type: 'start' },
    }),
  ]);

  const prematureCases = observations
    .filter(observation => observation.statusAfterStart !== 'submitted')
    .map(observation => observation.name);

  const contentTransitionFailures = observations
    .filter(observation => observation.statusAfterContent !== 'streaming')
    .map(observation => observation.name);

  if (prematureCases.length > 0) {
    throw new Error(
      `ISSUE_8579_REPRODUCED: start chunks prematurely changed status to streaming before content: ${prematureCases.join(
        ', ',
      )}`,
    );
  }

  if (contentTransitionFailures.length > 0) {
    throw new Error(
      `Expected actual content to change status to streaming: ${contentTransitionFailures.join(
        ', ',
      )}`,
    );
  }

  console.log(
    'Issue #8579 is not present: all start chunks stayed submitted until content arrived.',
  );
}

void main();
