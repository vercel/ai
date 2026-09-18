import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
import { toUIMessageStream } from '@ai-sdk/langchain';
import { readUIMessageStream, type UIMessageChunk } from 'ai';

async function main() {
  const toolCallId = 'call_test123';
  const messages = [
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
    new ToolMessage({
      content: JSON.stringify({ products: ['p1', 'p2', 'p3'] }),
      tool_call_id: toolCallId,
      id: 'tool-1',
    }),
  ];

  const valuesOnlyStream = (async function* () {
    yield ['values', { messages }];
  })();

  const events: UIMessageChunk[] = [];
  const reader = toUIMessageStream(valuesOnlyStream as never).getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    events.push(value);
  }

  const toolLifecycle = events.filter(
    event => 'toolCallId' in event && event.toolCallId === toolCallId,
  );
  const observedTypes = toolLifecycle.map(event => event.type);
  const expectedTypes = [
    'tool-input-start',
    'tool-input-available',
    'tool-output-available',
  ];

  const hasExpectedLifecycle =
    observedTypes.length === expectedTypes.length &&
    observedTypes.every((type, index) => type === expectedTypes[index]);

  console.log(
    `Observed UI chunk types: ${events.map(event => event.type).join(', ')}`,
  );

  const downstreamStream = new ReadableStream<UIMessageChunk>({
    start(controller) {
      for (const event of events) {
        if (event.type !== 'finish') controller.enqueue(event);
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

  let frontendError: unknown;
  try {
    const messageReader = readUIMessageStream({
      stream: downstreamStream,
      terminateOnError: true,
    }).getReader();
    while (!(await messageReader.read()).done) {
      // Consume all frontend message states.
    }
  } catch (error) {
    frontendError = error;
  }

  const frontendErrorMessage =
    frontendError instanceof Error ? frontendError.message : '';
  const hasReportedFrontendError = frontendErrorMessage.includes(
    `No tool invocation found for tool call ID "${toolCallId}".`,
  );

  if (!hasExpectedLifecycle && hasReportedFrontendError) {
    console.error(
      `ISSUE #21146 REPRODUCED: orphaned values-only tool call caused ${frontendErrorMessage}`,
    );
    process.exitCode = 1;
    return;
  }

  if (!hasExpectedLifecycle) {
    throw new Error(
      'The completed values-only tool lifecycle was missing, but the reported frontend error was not observed.',
    );
  }

  if (frontendError) throw frontendError;

  console.log(
    'Issue #21146 was not reproduced: the completed tool lifecycle rendered without a frontend error.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
