import assert from 'node:assert/strict';
import { DefaultChatTransport, readUIMessageStream, type UIMessage } from 'ai';

const reasoningIds = ['reasoning_123', 'reasoning_456'];

function formatSseEvent(value: unknown) {
  return `data: ${JSON.stringify(value)}\n\n`;
}

async function main() {
  const sse = [
    { type: 'start', messageId: 'assistant-message' },
    { type: 'start-step' },
    { type: 'reasoning-start', id: reasoningIds[0] },
    {
      type: 'reasoning-delta',
      id: reasoningIds[0],
      delta: 'Analyzing...',
    },
    { type: 'reasoning-end', id: reasoningIds[0] },
    { type: 'reasoning-start', id: reasoningIds[1] },
    {
      type: 'reasoning-delta',
      id: reasoningIds[1],
      delta: 'Checking...',
    },
    { type: 'reasoning-end', id: reasoningIds[1] },
    { type: 'text-start', id: 'text_123' },
    { type: 'text-delta', id: 'text_123', delta: 'Done.' },
    { type: 'text-end', id: 'text_123' },
    {
      type: 'tool-input-available',
      toolCallId: 'tool_123',
      toolName: 'lookup',
      input: { query: 'example' },
    },
    { type: 'finish-step' },
    { type: 'finish' },
  ]
    .map(formatSseEvent)
    .join('')
    .concat('data: [DONE]\n\n');

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

  const chunkStream = await transport.sendMessages({
    trigger: 'submit-message',
    chatId: 'chat-9077',
    messageId: undefined,
    messages: [],
    abortSignal: undefined,
  });

  let finalMessage: UIMessage | undefined;
  for await (const message of readUIMessageStream({ stream: chunkStream })) {
    finalMessage = message;
  }

  assert.ok(finalMessage, 'Expected the SSE stream to produce a UI message');

  const reasoningParts = finalMessage.parts.filter(
    part => part.type === 'reasoning',
  );
  const textPart = finalMessage.parts.find(part => part.type === 'text');
  const toolPart = finalMessage.parts.find(
    part => Reflect.get(part, 'toolCallId') === 'tool_123',
  );

  assert.deepEqual(
    reasoningParts.map(part => part.text),
    ['Analyzing...', 'Checking...'],
    'Expected both reasoning blocks to retain their streamed text',
  );
  assert.equal(
    toolPart == null ? undefined : Reflect.get(toolPart, 'toolCallId'),
    'tool_123',
    'Expected the tool part to preserve its tool call ID',
  );

  const observed = {
    reasoning: reasoningParts.map(part => ({
      text: part.text,
      id: Reflect.get(part, 'id'),
    })),
    text: {
      text: textPart?.text,
      id: textPart == null ? undefined : Reflect.get(textPart, 'id'),
    },
    tool: {
      toolCallId:
        toolPart == null ? undefined : Reflect.get(toolPart, 'toolCallId'),
    },
  };

  console.log(JSON.stringify(observed, null, 2));

  assert.deepEqual(
    reasoningParts.map(part => Reflect.get(part, 'id')),
    reasoningIds,
    'ISSUE #9077: reasoning SSE IDs were not preserved in ReasoningUIPart objects',
  );
}

main();
