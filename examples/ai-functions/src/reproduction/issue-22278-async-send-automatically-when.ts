import {
  AbstractChat,
  type ChatState,
  type ChatTransport,
  type UIMessage,
} from 'ai';

const predicateErrorMessage = 'predicate failed';
const unhandled: string[] = [];

class State implements ChatState<UIMessage> {
  status = 'ready' as const;
  error: Error | undefined;
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
  readonly observedErrors: string[] = [];

  constructor({
    state,
    transport,
  }: {
    state: State;
    transport: ChatTransport<UIMessage>;
  }) {
    super({
      id: 'chat-1',
      state,
      transport,
      sendAutomaticallyWhen: () =>
        Promise.reject(new Error(predicateErrorMessage)),
      onError: error => {
        this.observedErrors.push(error.message);
      },
    });
  }
}

async function captureResult(
  operation: void | PromiseLike<void>,
): Promise<string> {
  try {
    await operation;
    return 'resolved';
  } catch (error) {
    return `rejected: ${
      error instanceof Error ? error.message : String(error)
    }`;
  }
}

function wasSurfaced(chat: TestChat, operationResult: string): boolean {
  return (
    operationResult === `rejected: ${predicateErrorMessage}` ||
    chat.error?.message === predicateErrorMessage ||
    chat.observedErrors.includes(predicateErrorMessage)
  );
}

async function main() {
  const onUnhandledRejection = (error: unknown) => {
    unhandled.push(error instanceof Error ? error.message : String(error));
  };
  process.on('unhandledRejection', onUnhandledRejection);

  try {
    const toolState = new State();
    const toolChat = new TestChat({
      state: toolState,
      transport: {
        sendMessages: async () => {
          throw new Error('unexpected sendMessages');
        },
        reconnectToStream: async () => null,
      },
    });
    toolState.messages = [
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
        toolCallId: 'call-1',
        output: 'done',
      }),
    );

    const approvalState = new State();
    const approvalChat = new TestChat({
      state: approvalState,
      transport: {
        sendMessages: async () => {
          throw new Error('unexpected sendMessages');
        },
        reconnectToStream: async () => null,
      },
    });
    approvalState.messages = [
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

    const finishState = new State();
    const finishChat = new TestChat({
      state: finishState,
      transport: {
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
      },
    });

    const finishCallResult = await captureResult(
      finishChat.sendMessage({ text: 'hello' }),
    );

    await new Promise(resolve => setTimeout(resolve, 20));

    const observed = {
      toolCallResult,
      toolStatus: toolChat.status,
      toolError: toolChat.error?.message,
      toolOnError: toolChat.observedErrors,
      approvalCallResult,
      approvalStatus: approvalChat.status,
      approvalError: approvalChat.error?.message,
      approvalOnError: approvalChat.observedErrors,
      finishCallResult,
      finishStatus: finishChat.status,
      finishError: finishChat.error?.message,
      finishOnError: finishChat.observedErrors,
      unhandled,
    };
    console.log(JSON.stringify(observed, null, 2));

    const failedPaths = [
      !wasSurfaced(toolChat, toolCallResult) && 'addToolOutput',
      !wasSurfaced(approvalChat, approvalCallResult) &&
        'addToolApprovalResponse',
      !wasSurfaced(finishChat, finishCallResult) && 'stream completion',
    ].filter(Boolean);

    if (failedPaths.length > 0 || unhandled.includes(predicateErrorMessage)) {
      throw new Error(
        'ISSUE #22278 REPRODUCED: async sendAutomaticallyWhen rejection was not surfaced by tool updates and became an unhandledRejection',
      );
    }
  } finally {
    process.off('unhandledRejection', onUnhandledRejection);
  }
}

await main();
