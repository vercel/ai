import type { ChatTransport, UIMessage, UIMessageChunk } from 'ai';
import { Chat } from '../../../../packages/vue/dist/index.js';

const toolCallId = 'call-custom-text';
const firstDelta = '<main>';
const secondDelta = '<h1>Streaming custom tool input</h1></main>';
const completeInput = firstDelta + secondDelta;

async function waitFor(
  predicate: () => boolean,
  description: string,
): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (predicate()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  throw new Error(`Timed out waiting for ${description}`);
}

async function main() {
  let streamController:
    | ReadableStreamDefaultController<UIMessageChunk>
    | undefined;

  const transport: ChatTransport<UIMessage> = {
    async sendMessages() {
      return new ReadableStream<UIMessageChunk>({
        start(controller) {
          streamController = controller;
        },
      });
    },
    async reconnectToStream() {
      return null;
    },
  };

  const chat = new Chat({ transport });
  const sendPromise = chat.sendMessage({ text: 'Render the requested HTML.' });

  await waitFor(() => streamController != null, 'the chat response stream');

  function getAssistantMessage() {
    return chat.messages.at(-1);
  }

  function getToolPart() {
    const part = getAssistantMessage()?.parts.find(
      part => part.type === 'tool-setHtml',
    );
    return part as { input?: unknown; state: string } | undefined;
  }

  async function writeAndWait(chunk: UIMessageChunk, predicate: () => boolean) {
    streamController!.enqueue(chunk);
    await waitFor(predicate, `processing ${chunk.type}`);
  }

  await writeAndWait(
    {
      type: 'start',
      messageId: 'assistant-message',
    },
    () => getAssistantMessage()?.role === 'assistant',
  );
  await writeAndWait(
    { type: 'start-step' },
    () =>
      getAssistantMessage()?.parts.some(part => part.type === 'step-start') ===
      true,
  );
  await writeAndWait(
    {
      type: 'tool-input-start',
      toolCallId,
      toolName: 'setHtml',
    },
    () => getToolPart()?.state === 'input-streaming',
  );

  streamController!.enqueue({
    type: 'tool-input-delta',
    toolCallId,
    inputTextDelta: firstDelta,
  });
  await new Promise(resolve => setTimeout(resolve, 50));
  const inputAfterFirstDelta = getToolPart()?.input;

  streamController!.enqueue({
    type: 'tool-input-delta',
    toolCallId,
    inputTextDelta: secondDelta,
  });
  await new Promise(resolve => setTimeout(resolve, 50));
  const inputAfterSecondDelta = getToolPart()?.input;

  await writeAndWait(
    {
      type: 'tool-input-available',
      toolCallId,
      toolName: 'setHtml',
      input: completeInput,
    },
    () => getToolPart()?.input === completeInput,
  );
  const finalInput = getToolPart()?.input;

  streamController!.enqueue({ type: 'finish-step' });
  streamController!.enqueue({ type: 'finish' });
  streamController!.close();
  await sendPromise;

  if (
    inputAfterFirstDelta !== firstDelta ||
    inputAfterSecondDelta !== completeInput
  ) {
    console.error(
      'ISSUE #13021 REPRODUCED: freeform tool input stayed undefined during input-streaming and appeared only at input-available',
    );
    console.error(
      JSON.stringify({
        inputAfterFirstDelta,
        inputAfterSecondDelta,
        finalInput,
      }),
    );
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
