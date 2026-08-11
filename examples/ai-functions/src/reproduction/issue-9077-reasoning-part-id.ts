import {
  DefaultChatTransport,
  readUIMessageStream,
  type UIMessage,
  type UIMessageChunk,
} from 'ai';

const expectedReasoningIds = ['reasoning_123', 'reasoning_456'];
const expectedReasoningTexts = ['Analyzing...', 'Checking details...'];

async function collect<T>(stream: ReadableStream<T>): Promise<T[]> {
  const values: T[] = [];
  const reader = stream.getReader();

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      return values;
    }
    values.push(value);
  }
}

async function main() {
  const events: UIMessageChunk[] = [
    { type: 'start', messageId: 'message_123' },
    { type: 'reasoning-start', id: expectedReasoningIds[0] },
    {
      type: 'reasoning-delta',
      id: expectedReasoningIds[0],
      delta: expectedReasoningTexts[0],
    },
    { type: 'reasoning-end', id: expectedReasoningIds[0] },
    { type: 'reasoning-start', id: expectedReasoningIds[1] },
    {
      type: 'reasoning-delta',
      id: expectedReasoningIds[1],
      delta: expectedReasoningTexts[1],
    },
    { type: 'reasoning-end', id: expectedReasoningIds[1] },
    { type: 'text-start', id: 'text_789' },
    { type: 'text-delta', id: 'text_789', delta: 'Done.' },
    { type: 'text-end', id: 'text_789' },
    {
      type: 'tool-input-available',
      toolCallId: 'tool_abc',
      toolName: 'inspect',
      input: {},
    },
    { type: 'finish' },
  ];

  const sse = [
    ...events.map(event => `data: ${JSON.stringify(event)}\n\n`),
    'data: [DONE]\n\n',
  ].join('');

  const transport = new DefaultChatTransport({
    api: 'https://example.test/api/chat',
    fetch: async () =>
      new Response(sse, {
        headers: {
          'content-type': 'text/event-stream',
          'x-vercel-ai-ui-message-stream': 'v1',
        },
      }),
  });

  const decodedStream = await transport.sendMessages({
    trigger: 'submit-message',
    chatId: 'chat_123',
    messageId: undefined,
    messages: [],
    abortSignal: undefined,
  });
  const [decodedAuditStream, uiMessageStream] = decodedStream.tee();

  const [decodedEvents, messages] = await Promise.all([
    collect(decodedAuditStream),
    collect(readUIMessageStream({ stream: uiMessageStream })),
  ]);

  const decodedReasoningIds = decodedEvents
    .filter(event => event.type === 'reasoning-start')
    .map(event => event.id);

  if (
    JSON.stringify(decodedReasoningIds) !== JSON.stringify(expectedReasoningIds)
  ) {
    throw new Error(
      `Transport did not preserve reasoning ids: ${JSON.stringify(decodedReasoningIds)}`,
    );
  }

  const finalMessage = messages.at(-1) as UIMessage | undefined;
  if (finalMessage == null) {
    throw new Error('No UI message was produced.');
  }

  const reasoningParts = finalMessage.parts.filter(
    part => part.type === 'reasoning',
  );
  const reasoningTexts = reasoningParts.map(part => part.text);

  if (
    JSON.stringify(reasoningTexts) !== JSON.stringify(expectedReasoningTexts)
  ) {
    throw new Error(
      `Reasoning text was not assembled correctly: ${JSON.stringify(reasoningTexts)}`,
    );
  }

  const observedReasoningIds = reasoningParts.map(
    part => (part as typeof part & { id?: string }).id,
  );
  const textPart = finalMessage.parts.find(part => part.type === 'text');
  const toolPart = finalMessage.parts.find(
    part => part.type === 'tool-inspect',
  );

  console.log(
    JSON.stringify({
      decodedReasoningIds,
      reasoningParts,
      textPartId: (textPart as typeof textPart & { id?: string })?.id,
      toolCallId:
        toolPart?.type === 'tool-inspect' ? toolPart.toolCallId : undefined,
    }),
  );

  if (
    JSON.stringify(observedReasoningIds) !==
    JSON.stringify(expectedReasoningIds)
  ) {
    throw new Error(
      `ISSUE_9077_REPRODUCED: expected reasoning part ids ${expectedReasoningIds.join(',')} but received ${observedReasoningIds.map(id => String(id)).join(',')}`,
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
