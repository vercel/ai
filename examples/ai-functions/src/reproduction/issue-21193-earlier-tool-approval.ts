import assert from 'node:assert/strict';
import {
  AbstractChat,
  DefaultChatTransport,
  type ChatInit,
  type ChatState,
  type ChatStatus,
  type UIMessage,
  type UIMessageChunk,
} from 'ai';

class InMemoryChatState implements ChatState<UIMessage> {
  status: ChatStatus = 'ready';
  error: Error | undefined;
  messages: UIMessage[];

  constructor(messages: UIMessage[]) {
    this.messages = messages;
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

class InMemoryChat extends AbstractChat<UIMessage> {
  constructor(init: ChatInit<UIMessage>) {
    super({
      ...init,
      state: new InMemoryChatState(init.messages ?? []),
    });
  }
}

function createMessages({
  withLaterReply,
  alreadyApproved = false,
}: {
  withLaterReply: boolean;
  alreadyApproved?: boolean;
}): UIMessage[] {
  const messages: UIMessage[] = [
    {
      id: 'user-1',
      role: 'user',
      parts: [{ type: 'text', text: 'Check the weather in Tokyo.' }],
    },
    {
      id: 'proposal',
      role: 'assistant',
      parts: [
        {
          type: 'tool-weather',
          toolCallId: 'call-1',
          input: { city: 'Tokyo' },
          ...(alreadyApproved
            ? {
                state: 'approval-responded' as const,
                approval: { id: 'approval-1', approved: true },
              }
            : {
                state: 'approval-requested' as const,
                approval: { id: 'approval-1' },
              }),
        },
      ],
    },
  ];

  if (withLaterReply) {
    messages.push(
      {
        id: 'user-2',
        role: 'user',
        parts: [{ type: 'text', text: 'Leave that pending. What is 2 + 2?' }],
      },
      {
        id: 'later-reply',
        role: 'assistant',
        parts: [{ type: 'text', text: '4.' }],
      },
    );
  }

  return messages;
}

function formatChunk(chunk: UIMessageChunk): string {
  return `data: ${JSON.stringify(chunk)}\n\n`;
}

function resultTransport() {
  const chunks: UIMessageChunk[] = [
    { type: 'start', messageId: 'resumed-reply' },
    {
      type: 'tool-output-available',
      toolCallId: 'call-1',
      output: { temperature: 72, weather: 'sunny' },
    },
    { type: 'finish', finishReason: 'stop' },
  ];

  return new DefaultChatTransport({
    api: 'https://example.test/api/chat',
    fetch: async () =>
      new Response(chunks.map(formatChunk).join(''), {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      }),
  });
}

async function verifyLatestMessageControls() {
  for (const approved of [true, false]) {
    const chat = new InMemoryChat({
      id: 'latest-approval-control',
      messages: createMessages({ withLaterReply: false }),
    });

    await chat.addToolApprovalResponse({ id: 'approval-1', approved });

    assert.deepEqual(chat.messages[1].parts[0], {
      type: 'tool-weather',
      toolCallId: 'call-1',
      input: { city: 'Tokyo' },
      state: 'approval-responded',
      approval: { id: 'approval-1', approved, reason: undefined },
    });
  }

  const chat = new InMemoryChat({
    id: 'latest-result-control',
    messages: createMessages({
      withLaterReply: false,
      alreadyApproved: true,
    }),
    transport: resultTransport(),
  });

  await chat.sendMessage();

  assert.equal(chat.error, undefined);
  assert.equal(chat.status, 'ready');
  assert.match(JSON.stringify(chat.messages), /"state":"output-available"/);
}

async function collectHistoricalApprovalFailures(): Promise<string[]> {
  const failures: string[] = [];

  for (const approved of [true, false]) {
    const chat = new InMemoryChat({
      id: 'historical-approval',
      messages: createMessages({ withLaterReply: true }),
    });
    const laterConversation = structuredClone(chat.messages.slice(2));

    await chat.addToolApprovalResponse({ id: 'approval-1', approved });

    const part = chat.messages[1].parts[0];
    if (
      !('state' in part) ||
      part.state !== 'approval-responded' ||
      part.approval?.approved !== approved
    ) {
      failures.push(
        `approved=${approved} left the owning invocation in ${
          'state' in part ? part.state : 'an unknown state'
        }`,
      );
    }

    if (
      JSON.stringify(chat.messages.slice(2)) !==
      JSON.stringify(laterConversation)
    ) {
      failures.push(`approved=${approved} changed the later conversation`);
    }
  }

  return failures;
}

async function collectHistoricalResultFailures(): Promise<string[]> {
  const chat = new InMemoryChat({
    id: 'historical-result',
    messages: createMessages({
      withLaterReply: true,
      alreadyApproved: true,
    }),
    transport: resultTransport(),
  });

  await chat.sendMessage();

  const failures: string[] = [];
  if (chat.error != null) {
    failures.push(`resumed result reported "${chat.error.message}"`);
  }
  if (chat.status !== 'ready') {
    failures.push(`resumed result ended with status "${chat.status}"`);
  }
  if (!/"state":"output-available"/.test(JSON.stringify(chat.messages))) {
    failures.push('resumed result was not recorded as output-available');
  }

  return failures;
}

async function main() {
  await verifyLatestMessageControls();

  const failures = [
    ...(await collectHistoricalApprovalFailures()),
    ...(await collectHistoricalResultFailures()),
  ];

  if (failures.length > 0) {
    throw new Error(
      `ISSUE_21193_REPRODUCED: earlier tool approval/result handling failed\n- ${failures.join(
        '\n- ',
      )}`,
    );
  }

  console.log(
    'Issue #21193 did not reproduce: earlier approvals and resumed results succeeded.',
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
