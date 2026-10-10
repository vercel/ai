import {
  AbstractChat,
  type ChatState,
  type ChatStatus,
  type ChatTransport,
  type UIMessage,
  type UIMessageChunk,
} from 'ai';

class ReproductionState implements ChatState<UIMessage> {
  status: ChatStatus = 'ready';
  error: Error | undefined;
  messages: UIMessage[] = [];

  pushMessage(message: UIMessage) {
    this.messages.push(message);
  }

  popMessage() {
    this.messages.pop();
  }

  replaceMessage(index: number, message: UIMessage) {
    this.messages[index] = message;
  }

  snapshot = structuredClone;
}

class ReproductionChat extends AbstractChat<UIMessage> {}

type ControlledChat = {
  chat: ReproductionChat;
  controllers: ReadableStreamDefaultController<UIMessageChunk>[];
};

function createControlledChat(): ControlledChat {
  const controllers: ReadableStreamDefaultController<UIMessageChunk>[] = [];
  const transport: ChatTransport<UIMessage> = {
    async sendMessages() {
      return new ReadableStream<UIMessageChunk>({
        start(controller) {
          controllers.push(controller);
        },
      });
    },
    async reconnectToStream() {
      return null;
    },
  };

  return {
    chat: new ReproductionChat({
      state: new ReproductionState(),
      transport,
    }),
    controllers,
  };
}

async function waitFor(
  condition: () => boolean,
  description: string,
): Promise<void> {
  const timeoutAt = Date.now() + 5_000;

  while (!condition()) {
    if (Date.now() >= timeoutAt) {
      throw new Error(`Timed out waiting for ${description}`);
    }
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}

function startNewerResponse(
  controller: ReadableStreamDefaultController<UIMessageChunk>,
) {
  controller.enqueue({ type: 'start', messageId: 'newer-response' });
  controller.enqueue({ type: 'text-start', id: 'newer-text' });
  controller.enqueue({
    type: 'text-delta',
    id: 'newer-text',
    delta: 'still generating',
  });
}

function finishResponse(
  controller: ReadableStreamDefaultController<UIMessageChunk>,
) {
  controller.enqueue({ type: 'text-end', id: 'newer-text' });
  controller.enqueue({ type: 'finish' });
  controller.close();
}

async function reproduceOlderCompletion() {
  const { chat, controllers } = createControlledChat();

  const olderRequest = chat.sendMessage({ text: 'older' });
  await waitFor(() => controllers.length === 1, 'the older request');

  const newerRequest = chat.sendMessage({ text: 'newer' });
  await waitFor(() => controllers.length === 2, 'the newer request');

  startNewerResponse(controllers[1]);
  await waitFor(
    () => chat.status === 'streaming',
    'the newer response to stream',
  );

  controllers[0].enqueue({ type: 'finish' });
  controllers[0].close();
  await olderRequest;

  const observed = {
    status: chat.status,
    error: chat.error,
  };

  finishResponse(controllers[1]);
  await newerRequest;

  return observed;
}

async function reproduceOlderFailure() {
  const { chat, controllers } = createControlledChat();

  const olderRequest = chat.sendMessage({ text: 'older' });
  await waitFor(() => controllers.length === 1, 'the older request');

  const newerRequest = chat.sendMessage({ text: 'newer' });
  await waitFor(() => controllers.length === 2, 'the newer request');

  startNewerResponse(controllers[1]);
  await waitFor(
    () => chat.status === 'streaming',
    'the newer response to stream',
  );

  controllers[0].error(new Error('older request failed'));
  await olderRequest;

  const observed = {
    status: chat.status,
    error: chat.error,
  };

  finishResponse(controllers[1]);
  await newerRequest;

  return observed;
}

async function main() {
  const completion = await reproduceOlderCompletion();
  const failure = await reproduceOlderFailure();

  console.log({
    completionWhileNewerStreamRemainsOpen: {
      status: completion.status,
      error: completion.error?.message,
    },
    failureWhileNewerStreamRemainsOpen: {
      status: failure.status,
      error: failure.error?.message,
    },
  });

  const completionPreservedNewerState =
    completion.status === 'streaming' && completion.error === undefined;
  const failurePreservedNewerState =
    failure.status === 'streaming' && failure.error === undefined;

  if (!completionPreservedNewerState || !failurePreservedNewerState) {
    throw new Error(
      'ISSUE_22589: an older request overwrote the active newer stream status or error',
    );
  }
}

await main();
