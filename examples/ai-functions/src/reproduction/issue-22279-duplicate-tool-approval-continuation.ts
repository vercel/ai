import {
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type ChatTransport,
  type UIMessage,
  type UIMessageChunk,
} from 'ai';

type SubmittedApproval = {
  state: string;
  approval: unknown;
};

type ScenarioResult = {
  sendCount: number;
  submittedApprovals: SubmittedApproval[][];
};

const { Chat } = await import(
  new URL('../../../../packages/react/dist/index.js', import.meta.url).href
);

async function runScenario({
  responseCount,
  asynchronousPredicate,
}: {
  responseCount: number;
  asynchronousPredicate: boolean;
}): Promise<ScenarioResult> {
  let sendCount = 0;
  const submittedApprovals: SubmittedApproval[][] = [];

  const transport: ChatTransport<UIMessage> = {
    async sendMessages({ messages }) {
      sendCount++;
      submittedApprovals.push(
        messages.flatMap(message =>
          message.parts.flatMap(part =>
            part.type === 'tool-updateProduct' &&
            'state' in part &&
            'approval' in part
              ? [
                  {
                    state: String(part.state),
                    approval: part.approval,
                  },
                ]
              : [],
          ),
        ),
      );

      return new ReadableStream<UIMessageChunk>({
        start(controller) {
          controller.enqueue({
            type: 'tool-output-available',
            toolCallId: 'call-1',
            output: { price: 12 },
          });
          controller.enqueue({ type: 'finish', finishReason: 'stop' });
          controller.close();
        },
      });
    },
    async reconnectToStream() {
      return null;
    },
  };

  const chat = new Chat({
    id: 'chat-1',
    messages: [
      {
        id: 'assistant-1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-updateProduct',
            toolCallId: 'call-1',
            state: 'approval-requested',
            input: { price: 12 },
            approval: { id: 'approval-1' },
          },
        ],
      },
    ],
    sendAutomaticallyWhen: ({ messages }: { messages: UIMessage[] }) => {
      const evaluate = () =>
        lastAssistantMessageIsCompleteWithApprovalResponses({ messages });

      return asynchronousPredicate
        ? Promise.resolve().then(evaluate)
        : evaluate();
    },
    transport,
  });

  await Promise.all(
    Array.from({ length: responseCount }, () =>
      chat.addToolApprovalResponse({
        id: 'approval-1',
        approved: true,
      }),
    ),
  );

  await new Promise(resolve => setTimeout(resolve, 0));

  return { sendCount, submittedApprovals };
}

async function main() {
  const singleResponseControl = await runScenario({
    responseCount: 1,
    asynchronousPredicate: true,
  });
  if (singleResponseControl.sendCount !== 1) {
    throw new Error(
      `Control failed: one response produced ${singleResponseControl.sendCount} continuation requests.`,
    );
  }

  const synchronousPredicateControl = await runScenario({
    responseCount: 2,
    asynchronousPredicate: false,
  });
  if (synchronousPredicateControl.sendCount !== 1) {
    throw new Error(
      `Control failed: a synchronous predicate produced ${synchronousPredicateControl.sendCount} continuation requests.`,
    );
  }

  const result = await runScenario({
    responseCount: 2,
    asynchronousPredicate: true,
  });

  const duplicateResponses =
    result.sendCount > 1 &&
    result.submittedApprovals.every(
      approvals =>
        approvals.length === 1 &&
        approvals[0].state === 'approval-responded' &&
        JSON.stringify(approvals[0].approval) ===
          JSON.stringify({ id: 'approval-1', approved: true }),
    );

  console.log(JSON.stringify(result, null, 2));

  if (duplicateResponses) {
    throw new Error(
      `ISSUE_22279_REPRODUCED: one approval ID sent ${result.sendCount} duplicate continuation requests.`,
    );
  }

  if (result.sendCount !== 1) {
    throw new Error(
      `Expected exactly one continuation request, received ${result.sendCount}.`,
    );
  }
}

await main();
