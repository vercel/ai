import {
  DefaultChatTransport,
  readUIMessageStream,
} from '../../../../packages/ai/dist/index.mjs';

const EXPECTED_REASONING_IDS = ['reasoning_123', 'reasoning_456'];
const FAILURE_SIGNAL =
  'ISSUE_9077_REPRODUCED: reasoning SSE ids were not preserved in ReasoningUIPart objects';

async function main() {
  const events = [
    { type: 'start', messageId: 'message_123' },
    { type: 'reasoning-start', id: EXPECTED_REASONING_IDS[0] },
    {
      type: 'reasoning-delta',
      id: EXPECTED_REASONING_IDS[0],
      delta: 'Analyzing...',
    },
    { type: 'reasoning-end', id: EXPECTED_REASONING_IDS[0] },
    { type: 'reasoning-start', id: EXPECTED_REASONING_IDS[1] },
    {
      type: 'reasoning-delta',
      id: EXPECTED_REASONING_IDS[1],
      delta: 'Checking...',
    },
    { type: 'reasoning-end', id: EXPECTED_REASONING_IDS[1] },
    { type: 'finish' },
  ];

  const sse =
    events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('') +
    'data: [DONE]\n\n';

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

  const decodedReasoningIds: string[] = [];
  const decodedStream = (
    await transport.sendMessages({
      trigger: 'submit-message',
      chatId: 'chat_123',
      messageId: undefined,
      messages: [],
      abortSignal: undefined,
    })
  ).pipeThrough(
    new TransformStream({
      transform(chunk, controller) {
        if (
          chunk.type === 'reasoning-start' ||
          chunk.type === 'reasoning-delta' ||
          chunk.type === 'reasoning-end'
        ) {
          decodedReasoningIds.push(chunk.id);
        }
        controller.enqueue(chunk);
      },
    }),
  );

  let finalMessage:
    | {
        parts: Array<Record<string, unknown>>;
      }
    | undefined;

  for await (const message of readUIMessageStream({ stream: decodedStream })) {
    finalMessage = message as typeof finalMessage;
  }

  if (finalMessage == null) {
    throw new Error(
      'Harness failure: the UI message stream emitted no message',
    );
  }

  const reasoningParts = finalMessage.parts.filter(
    part => part.type === 'reasoning',
  );
  const actualTexts = reasoningParts.map(part => part.text);
  const actualReasoningIds = reasoningParts.map(part => part.id);

  const expectedDecodedIds = EXPECTED_REASONING_IDS.flatMap(id => [id, id, id]);

  if (
    JSON.stringify(decodedReasoningIds) !== JSON.stringify(expectedDecodedIds)
  ) {
    throw new Error(
      `Harness failure: transport did not preserve SSE chunk ids; received ${JSON.stringify(decodedReasoningIds)}`,
    );
  }

  if (
    JSON.stringify(actualTexts) !==
    JSON.stringify(['Analyzing...', 'Checking...'])
  ) {
    throw new Error(
      `Harness failure: reasoning text was not assembled; received ${JSON.stringify(actualTexts)}`,
    );
  }

  if (
    JSON.stringify(actualReasoningIds) !==
    JSON.stringify(EXPECTED_REASONING_IDS)
  ) {
    console.error(
      `${FAILURE_SIGNAL}; expected ${JSON.stringify(EXPECTED_REASONING_IDS)}, received ${JSON.stringify(actualReasoningIds)}`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `Issue #9077 no longer reproduces: received ${JSON.stringify(actualReasoningIds)}`,
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
