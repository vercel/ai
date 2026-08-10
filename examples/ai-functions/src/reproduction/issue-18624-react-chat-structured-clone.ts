import type { ChatTransport, UIMessage, UIMessageChunk } from 'ai';
import { Chat } from '../../../../packages/react/dist/index.js';

const toolCount = 40;
const toolOutputBytes = 64 * 1024;
const failureSignal =
  'Reproduced issue #18624: useChat deep-cloned accumulated tool outputs on every tool stream chunk.';

function accumulatedToolOutputBytes(value: unknown): number {
  if (
    value == null ||
    typeof value !== 'object' ||
    !('role' in value) ||
    value.role !== 'assistant' ||
    !('parts' in value) ||
    !Array.isArray(value.parts)
  ) {
    return 0;
  }

  return value.parts.reduce((total, part) => {
    if (
      part == null ||
      typeof part !== 'object' ||
      !('output' in part) ||
      part.output == null ||
      typeof part.output !== 'object' ||
      !('payload' in part.output) ||
      typeof part.output.payload !== 'string'
    ) {
      return total;
    }

    return total + Buffer.byteLength(part.output.payload);
  }, 0);
}

function createToolHeavyStream(): ReadableStream<UIMessageChunk> {
  const payload = 'x'.repeat(toolOutputBytes);
  const chunks: UIMessageChunk[] = [
    { type: 'start', messageId: 'assistant-message' },
    { type: 'start-step' },
  ];

  for (let index = 0; index < toolCount; index++) {
    chunks.push(
      {
        type: 'tool-input-available',
        toolCallId: `tool-call-${index}`,
        toolName: 'large-output-tool',
        input: { index },
      },
      {
        type: 'tool-output-available',
        toolCallId: `tool-call-${index}`,
        output: { payload },
      },
    );
  }

  chunks.push({ type: 'finish-step' }, { type: 'finish' });

  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

async function main() {
  const originalStructuredClone = globalThis.structuredClone;
  let assistantCloneCalls = 0;
  let cumulativeClonedToolOutputBytes = 0;

  globalThis.structuredClone = ((value, options) => {
    const bytes = accumulatedToolOutputBytes(value);

    if (bytes > 0) {
      assistantCloneCalls++;
      cumulativeClonedToolOutputBytes += bytes;
    }

    return originalStructuredClone(value, options);
  }) as typeof structuredClone;

  const transport: ChatTransport<UIMessage> = {
    async sendMessages() {
      return createToolHeavyStream();
    },
    async reconnectToStream() {
      return null;
    },
  };

  const chat = new Chat({
    id: 'issue-18624',
    generateId: (() => {
      let id = 0;
      return () => `generated-${id++}`;
    })(),
    transport,
  });

  try {
    await chat.sendMessage({ text: 'Run the tool-heavy turn.' });
  } finally {
    globalThis.structuredClone = originalStructuredClone;
  }

  const finalToolOutputBytes = accumulatedToolOutputBytes(chat.messages.at(-1));
  const expectedFinalToolOutputBytes = toolCount * toolOutputBytes;
  const cloneAmplification =
    cumulativeClonedToolOutputBytes / finalToolOutputBytes;

  console.log(
    JSON.stringify(
      {
        toolCount,
        toolOutputBytes,
        assistantCloneCalls,
        finalToolOutputBytes,
        cumulativeClonedToolOutputBytes,
        cloneAmplification,
      },
      null,
      2,
    ),
  );

  if (finalToolOutputBytes !== expectedFinalToolOutputBytes) {
    throw new Error(
      `Reproduction setup failed: expected ${expectedFinalToolOutputBytes} final tool-output bytes, received ${finalToolOutputBytes}.`,
    );
  }

  if (cumulativeClonedToolOutputBytes > finalToolOutputBytes * 2) {
    throw new Error(failureSignal);
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
