import assert from 'node:assert/strict';
import {
  AbstractChat,
  type ChatState,
  type ChatTransport,
  type UIMessage,
} from 'ai';

class State implements ChatState<UIMessage> {
  status = 'ready' as const;
  error = undefined;
  messages: UIMessage[] = [];

  pushMessage = (message: UIMessage) => {
    this.messages = [...this.messages, message];
  };

  popMessage = () => {
    this.messages = this.messages.slice(0, -1);
  };

  replaceMessage = (index: number, message: UIMessage) => {
    this.messages = this.messages.map((old, i) =>
      i === index ? message : old,
    );
  };

  snapshot = <T>(value: T): T => structuredClone(value);
}

class TestChat extends AbstractChat<UIMessage> {
  constructor(
    readonly exposedState: State,
    transport: ChatTransport<UIMessage>,
  ) {
    super({
      id: 'chat-1',
      state: exposedState,
      sendAutomaticallyWhen: () =>
        Promise.reject(new Error('predicate failed')),
      transport,
    });
  }
}

const createChat = (transport: ChatTransport<UIMessage>) => {
  const state = new State();
  return new TestChat(state, transport);
};

const unexpectedSendTransport: ChatTransport<UIMessage> = {
  sendMessages: async () => {
    throw new Error('unexpected sendMessages');
  },
  reconnectToStream: async () => null,
};

async function captureResult(
  operation: void | PromiseLike<void>,
): Promise<string> {
  return Promise.resolve(operation).then(
    () => 'resolved',
    error => `rejected: ${(error as Error).message}`,
  );
}

async function main() {
  const unhandled: string[] = [];
  const onUnhandledRejection = (error: unknown) => {
    unhandled.push(error instanceof Error ? error.message : String(error));
  };
  process.on('unhandledRejection', onUnhandledRejection);

  try {
    const toolChat = createChat(unexpectedSendTransport);
    toolChat.exposedState.messages = [
      {
        id: 'assistant-1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-test',
            toolCallId: 'call-1',
            state: 'input-available',
            input: {},
          },
        ],
      },
    ];

    const toolCallResult = await captureResult(
      toolChat.addToolOutput({
        tool: 'test',
        state: 'output-available',
        toolCallId: 'call-1',
        output: 'done',
      }),
    );

    const approvalChat = createChat(unexpectedSendTransport);
    approvalChat.exposedState.messages = [
      {
        id: 'assistant-2',
        role: 'assistant',
        parts: [
          {
            type: 'tool-test',
            toolCallId: 'call-2',
            state: 'approval-requested',
            input: {},
            approval: { id: 'approval-1' },
          },
        ],
      },
    ];

    const approvalCallResult = await captureResult(
      approvalChat.addToolApprovalResponse({
        id: 'approval-1',
        approved: true,
      }),
    );

    const finishChat = createChat({
      sendMessages: async () =>
        new ReadableStream({
          start(controller) {
            controller.enqueue({ type: 'start' });
            controller.enqueue({ type: 'start-step' });
            controller.enqueue({ type: 'text-start', id: 'text-1' });
            controller.enqueue({
              type: 'text-delta',
              id: 'text-1',
              delta: 'done',
            });
            controller.enqueue({ type: 'text-end', id: 'text-1' });
            controller.enqueue({ type: 'finish', finishReason: 'stop' });
            controller.close();
          },
        }),
      reconnectToStream: async () => null,
    });

    const finishCallResult = await captureResult(
      finishChat.sendMessage({ text: 'hello' }),
    );

    await new Promise(resolve => setTimeout(resolve, 10));

    const result = {
      toolCallResult,
      approvalCallResult,
      finishCallResult,
      unhandled,
      toolStatus: toolChat.status,
      toolError: toolChat.error?.message,
      approvalStatus: approvalChat.status,
      approvalError: approvalChat.error?.message,
      finishStatus: finishChat.status,
      finishError: finishChat.error?.message,
    };
    console.log(result);

    const predicateFailureWasSurfaced = (
      operationResult: string,
      chat: TestChat,
    ) =>
      operationResult === 'rejected: predicate failed' ||
      (chat.status === 'error' && chat.error?.message === 'predicate failed');

    assert.equal(
      predicateFailureWasSurfaced(toolCallResult, toolChat),
      true,
      'addToolOutput dropped the rejected sendAutomaticallyWhen predicate',
    );
    assert.equal(
      predicateFailureWasSurfaced(approvalCallResult, approvalChat),
      true,
      'addToolApprovalResponse dropped the rejected sendAutomaticallyWhen predicate',
    );
    assert.equal(
      predicateFailureWasSurfaced(finishCallResult, finishChat),
      true,
      'sendMessage dropped the rejected sendAutomaticallyWhen predicate',
    );
    assert.deepEqual(
      unhandled,
      [],
      'rejected sendAutomaticallyWhen predicates became unhandled rejections',
    );
  } finally {
    process.off('unhandledRejection', onUnhandledRejection);
  }
}

main().catch(error => {
  console.error('ISSUE_22278_REPRODUCTION_FAILED', error);
  process.exitCode = 1;
});
