import {
  AbstractChat,
  DefaultChatTransport,
  type ChatInit,
  type ChatState,
  type ChatStatus,
  type UIMessage,
  type UIMessageChunk,
} from 'ai';

class TestChatState implements ChatState<UIMessage> {
  status: ChatStatus = 'ready';
  error: Error | undefined;
  messages: UIMessage[];

  constructor(messages: UIMessage[]) {
    this.messages = structuredClone(messages);
  }

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

class TestChat extends AbstractChat<UIMessage> {
  constructor(init: ChatInit<UIMessage>) {
    super({
      ...init,
      state: new TestChatState(init.messages ?? []),
    });
  }
}

const approvalRequest = {
  type: 'tool-weather' as const,
  toolCallId: 'call-1',
  state: 'approval-requested' as const,
  input: { city: 'Tokyo' },
  approval: { id: 'approval-1' },
};

const approvalResponse = {
  ...approvalRequest,
  state: 'approval-responded' as const,
  approval: { id: 'approval-1', approved: true },
};

function initialMessages(
  toolPart: UIMessage['parts'][number] = approvalRequest,
): UIMessage[] {
  return [
    {
      id: 'user-1',
      role: 'user',
      parts: [{ type: 'text', text: 'What is the weather in Tokyo?' }],
    },
    {
      id: 'assistant-1',
      role: 'assistant',
      parts: [{ type: 'step-start' }, toolPart],
    },
  ];
}

function historicalMessages(
  toolPart: UIMessage['parts'][number] = approvalRequest,
): UIMessage[] {
  return [
    ...initialMessages(toolPart),
    {
      id: 'user-2',
      role: 'user',
      parts: [{ type: 'text', text: 'We can discuss something else first.' }],
    },
    {
      id: 'assistant-2',
      role: 'assistant',
      parts: [{ type: 'text', text: 'This later reply must be preserved.' }],
    },
  ];
}

function streamTransport(chunks: UIMessageChunk[]) {
  const body = chunks
    .map(chunk => `data: ${JSON.stringify(chunk)}\n\n`)
    .join('');

  return new DefaultChatTransport({
    api: 'http://issue-21193.test/api/chat',
    fetch: async () =>
      new Response(body, {
        headers: { 'content-type': 'text/event-stream' },
      }),
  });
}

const outputChunks: UIMessageChunk[] = [
  { type: 'start' },
  { type: 'start-step' },
  {
    type: 'tool-output-available',
    toolCallId: 'call-1',
    output: { temperature: 72, weather: 'sunny' },
  },
  { type: 'finish-step' },
  { type: 'finish', finishReason: 'stop' },
];

function getToolPart(chat: TestChat, messageIndex: number) {
  return chat.messages[messageIndex].parts[1] as {
    state: string;
    output?: unknown;
    approval?: { id: string; approved?: boolean };
  };
}

function requireHarness(
  condition: boolean,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(`REPRODUCTION HARNESS ERROR: ${message}`);
  }
}

async function verifyLatestMessageControls() {
  for (const approved of [true, false]) {
    const chat = new TestChat({ messages: initialMessages() });

    await chat.addToolApprovalResponse({
      id: 'approval-1',
      approved,
    });

    const toolPart = getToolPart(chat, 1);
    requireHarness(
      toolPart.state === 'approval-responded' &&
        toolPart.approval?.approved === approved,
      `latest-message ${approved ? 'approval' : 'rejection'} control failed`,
    );
  }

  const chat = new TestChat({
    messages: initialMessages(approvalResponse),
    transport: streamTransport(outputChunks),
  });

  await chat.sendMessage();

  const toolPart = getToolPart(chat, 1);
  requireHarness(
    chat.status === 'ready' &&
      toolPart.state === 'output-available' &&
      toolPart.output != null,
    'latest-message result control failed',
  );
}

async function main() {
  await verifyLatestMessageControls();

  const failures: string[] = [];

  for (const approved of [true, false]) {
    const chat = new TestChat({ messages: historicalMessages() });
    const laterConversation = structuredClone(chat.messages.slice(2));

    await chat.addToolApprovalResponse({
      id: 'approval-1',
      approved,
    });

    const toolPart = getToolPart(chat, 1);
    if (
      toolPart.state !== 'approval-responded' ||
      toolPart.approval?.approved !== approved
    ) {
      failures.push(
        `historical ${approved ? 'approval' : 'rejection'} left call-1 in ${toolPart.state}`,
      );
    }

    if (
      JSON.stringify(chat.messages.slice(2)) !==
      JSON.stringify(laterConversation)
    ) {
      failures.push(
        `historical ${approved ? 'approval' : 'rejection'} changed later conversation messages`,
      );
    }
  }

  const chat = new TestChat({
    messages: historicalMessages(approvalResponse),
    transport: streamTransport(outputChunks),
  });
  const laterConversation = structuredClone(chat.messages.slice(2));

  await chat.sendMessage();

  const toolPart = getToolPart(chat, 1);
  if (
    chat.status !== 'ready' ||
    toolPart.state !== 'output-available' ||
    toolPart.output == null
  ) {
    failures.push(
      `historical result ended with status=${chat.status}, state=${toolPart.state}, error=${chat.error?.message ?? 'none'}`,
    );
  }

  if (
    JSON.stringify(chat.messages.slice(2)) !== JSON.stringify(laterConversation)
  ) {
    failures.push('historical result changed later conversation messages');
  }

  if (failures.length > 0) {
    console.error(
      `ISSUE #21193 REPRODUCED: earlier tool approvals remain pending or resumed results fail\n${failures
        .map(failure => `- ${failure}`)
        .join('\n')}`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    'Issue #21193 was not reproduced: historical approval decisions and results updated their owning message while preserving later conversation.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 2;
});
