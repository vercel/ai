import {
  AIMessage,
  HumanMessage,
  ToolMessage,
} from '../../../../packages/langchain/node_modules/@langchain/core/dist/messages/index.js';
import { readUIMessageStream, type UIMessageChunk } from 'ai';

const toolCallId = 'call_test123';

function createMessages() {
  const pendingMessages = [
    new HumanMessage({ content: 'list products', id: 'h1' }),
    new AIMessage({
      content: '',
      tool_calls: [
        {
          id: toolCallId,
          name: 'searchProducts',
          args: { query: 'list' },
        },
      ],
      id: 'ai-1',
    }),
  ];

  return {
    pendingMessages,
    completedMessages: [
      ...pendingMessages,
      new ToolMessage({
        content: JSON.stringify({ products: ['p1', 'p2', 'p3'] }),
        tool_call_id: toolCallId,
        id: 'tool-1',
      }),
    ],
  };
}

async function collectEvents(
  stream: AsyncIterable<unknown>,
): Promise<UIMessageChunk[]> {
  const langchainModuleUrl = new URL(
    '../../../../packages/langchain/src/index.ts',
    import.meta.url,
  ).href;
  const { toUIMessageStream } = (await import(langchainModuleUrl)) as {
    toUIMessageStream: (
      stream: AsyncIterable<unknown>,
    ) => ReadableStream<UIMessageChunk>;
  };
  const events: UIMessageChunk[] = [];
  const reader = toUIMessageStream(stream).getReader();

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    events.push(value);
  }

  return events;
}

function getToolLifecycle(events: UIMessageChunk[]) {
  return events
    .filter(event => 'toolCallId' in event && event.toolCallId === toolCallId)
    .map(event => event.type);
}

async function getFrontendError(events: UIMessageChunk[]) {
  const downstreamStream = new ReadableStream<UIMessageChunk>({
    start(controller) {
      for (const event of events) {
        if (event.type !== 'finish') {
          controller.enqueue(event);
        }
      }

      controller.enqueue({
        type: 'tool-output-available',
        toolCallId,
        output: 'subsequent tool output',
      });
      controller.enqueue({ type: 'finish' });
      controller.close();
    },
  });

  try {
    for await (const _message of readUIMessageStream({
      stream: downstreamStream,
      terminateOnError: true,
    })) {
      // Consume all frontend message states.
    }
  } catch (error) {
    return error;
  }
}

async function main() {
  const { pendingMessages, completedMessages } = createMessages();

  const currentTurnEvents = await collectEvents(
    (async function* () {
      yield ['values', { messages: pendingMessages }];
      yield ['values', { messages: completedMessages }];
    })(),
  );

  const expectedLifecycle = [
    'tool-input-start',
    'tool-input-available',
    'tool-output-available',
  ];
  const observedLifecycle = getToolLifecycle(currentTurnEvents);
  const hasExpectedLifecycle =
    observedLifecycle.length === expectedLifecycle.length &&
    observedLifecycle.every(
      (eventType, index) => eventType === expectedLifecycle[index],
    );

  console.log(
    `Current-turn UI chunk types: ${currentTurnEvents.map(event => event.type).join(', ')}`,
  );

  if (hasExpectedLifecycle) {
    console.log(
      'Issue #21146 was not reproduced: the completed values-only tool lifecycle was emitted.',
    );
    return;
  }

  const reportedSingleSnapshotEvents = await collectEvents(
    (async function* () {
      yield ['values', { messages: completedMessages }];
    })(),
  );
  const reportedSingleSnapshotLifecycle = getToolLifecycle(
    reportedSingleSnapshotEvents,
  );
  const frontendError = await getFrontendError(reportedSingleSnapshotEvents);
  const frontendErrorMessage =
    frontendError instanceof Error ? frontendError.message : '';
  const hasReportedFrontendError = frontendErrorMessage.includes(
    `No tool invocation found for tool call ID "${toolCallId}".`,
  );

  console.log(
    `Reported single-snapshot UI chunk types: ${reportedSingleSnapshotEvents.map(event => event.type).join(', ')}`,
  );

  if (
    reportedSingleSnapshotLifecycle.length === 0 &&
    hasReportedFrontendError
  ) {
    console.error(
      `ISSUE #21146 REPRODUCED: values-only completed tool lifecycle omitted tool-output-available; orphaned snapshot caused ${frontendErrorMessage}`,
    );
    process.exitCode = 1;
    return;
  }

  throw new Error(
    `The current-turn lifecycle was incomplete (${observedLifecycle.join(', ')}), but the issue's reported orphaned-tool consequence was not observed.`,
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
