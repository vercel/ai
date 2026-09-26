import { toUIMessageStream } from '@ai-sdk/langchain';
import { ToolMessage } from '@langchain/core/messages';
import { createUIMessageStream, type UIMessageChunk } from 'ai';

const toolCallId = 'call_1';

async function* source() {
  yield [
    'messages',
    [
      new ToolMessage({
        tool_call_id: toolCallId,
        content: '3 products found',
        name: 'searchProducts',
        id: 'tool-1',
      }),
      { langgraph_node: 'executor' },
    ],
  ] as [string, unknown];
}

async function main() {
  const langchainStream = toUIMessageStream(
    source() as unknown as Parameters<typeof toUIMessageStream>[0],
  );
  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      writer.merge(langchainStream);
    },
  });

  const chunks: UIMessageChunk[] = [];
  const reader = stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    chunks.push(value);
  }

  const toolEvents = chunks
    .map((chunk, index) => ({
      index,
      type: chunk.type,
      toolCallId: 'toolCallId' in chunk ? chunk.toolCallId : undefined,
    }))
    .filter(event => event.toolCallId === toolCallId);

  console.log(JSON.stringify(toolEvents, null, 2));

  const outputIndex = toolEvents.findIndex(
    event => event.type === 'tool-output-available',
  );
  if (outputIndex === -1) {
    throw new Error(
      `SETUP FAILED: no tool-output-available was emitted for ${toolCallId}`,
    );
  }

  const startIndex = toolEvents.findIndex(
    event => event.type === 'tool-input-start',
  );
  if (startIndex === -1 || startIndex > outputIndex) {
    console.error(
      `BUG REPRODUCED: ${toolCallId} emitted tool-output-available without a preceding tool-input-start`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `PASS: ${toolCallId} emitted tool-input-start before tool-output-available`,
  );
}

main().catch(error => {
  console.error('REPRODUCTION ERROR:', error);
  process.exitCode = 2;
});
