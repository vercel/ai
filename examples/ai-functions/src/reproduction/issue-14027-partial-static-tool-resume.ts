import {
  AbstractChat,
  readUIMessageStream,
  type ChatState,
  type ChatTransport,
  type UIMessage,
  type UIMessageChunk,
} from '../../../../packages/ai/dist/index.mjs';

const toolCallId = 'tool-call-14027';
const expectedTitle = 'Quarterly plan';

function createPartialMessage(): UIMessage {
  return {
    id: 'assistant-14027',
    role: 'assistant',
    parts: [
      {
        type: 'tool-create_document',
        toolCallId,
        state: 'input-streaming',
        input: { title: 'Quarterly' },
        rawInput: '{"title":"Quarterly',
      },
    ],
  } as unknown as UIMessage;
}

function createFreshStream(): ReadableStream<UIMessageChunk> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue({
        type: 'tool-input-start',
        toolCallId,
        toolName: 'create_document',
      });
      controller.enqueue({
        type: 'tool-input-delta',
        toolCallId,
        inputTextDelta: `{"title":"${expectedTitle}"}`,
      });
      controller.enqueue({
        type: 'tool-input-available',
        toolCallId,
        toolName: 'create_document',
        input: { title: expectedTitle },
      });
      controller.close();
    },
  });
}

function createResumedStream(): ReadableStream<UIMessageChunk> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue({
        type: 'tool-input-delta',
        toolCallId,
        inputTextDelta: ' plan"}',
      });
      controller.enqueue({
        type: 'tool-input-available',
        toolCallId,
        toolName: 'create_document',
        input: { title: expectedTitle },
      });
      controller.close();
    },
  });
}

function assertCompletedToolCall(message: UIMessage | undefined): void {
  const toolPart = message?.parts.find(
    part =>
      part.type === 'tool-create_document' && part.toolCallId === toolCallId,
  );

  if (
    toolPart?.type !== 'tool-create_document' ||
    toolPart.state !== 'input-available' ||
    toolPart.input == null ||
    typeof toolPart.input !== 'object' ||
    !('title' in toolPart.input) ||
    toolPart.input.title !== expectedTitle
  ) {
    throw new Error(
      `Expected the resumed static tool call to finish with input {"title":"${expectedTitle}"}.`,
    );
  }
}

function isPartialStaticToolResumeFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);

  return (
    message === "Cannot read properties of undefined (reading 'text')" ||
    message === "Cannot read properties of undefined (reading 'split')" ||
    message.includes(
      `Received tool-input-delta for missing tool call with ID "${toolCallId}"`,
    )
  );
}

async function readFinalMessage({
  message,
  stream,
}: {
  message?: UIMessage;
  stream: ReadableStream<UIMessageChunk>;
}): Promise<UIMessage | undefined> {
  let finalMessage: UIMessage | undefined;

  for await (const currentMessage of readUIMessageStream({
    message,
    stream,
    terminateOnError: true,
  })) {
    finalMessage = currentMessage;
  }

  return finalMessage;
}

async function readerResumeFails(): Promise<boolean> {
  try {
    assertCompletedToolCall(
      await readFinalMessage({
        message: createPartialMessage(),
        stream: createResumedStream(),
      }),
    );
    return false;
  } catch (error) {
    if (isPartialStaticToolResumeFailure(error)) {
      return true;
    }
    throw error;
  }
}

class ReproductionChat extends AbstractChat<UIMessage> {}

async function chatResumeFails(): Promise<boolean> {
  const messages = [createPartialMessage()];
  const state: ChatState<UIMessage> = {
    status: 'ready',
    error: undefined,
    messages,
    pushMessage(message) {
      messages.push(message);
    },
    popMessage() {
      messages.pop();
    },
    replaceMessage(index, message) {
      messages[index] = message;
    },
    snapshot: structuredClone,
  };
  const transport: ChatTransport<UIMessage> = {
    async sendMessages() {
      throw new Error('Unexpected sendMessages call during resume.');
    },
    async reconnectToStream() {
      return createResumedStream();
    },
  };
  const chat = new ReproductionChat({
    id: 'chat-14027',
    generateId: () => 'generated-assistant-14027',
    state,
    transport,
  });

  await chat.resumeStream();

  if (isPartialStaticToolResumeFailure(chat.error)) {
    return true;
  }
  if (chat.error != null) {
    throw chat.error;
  }

  assertCompletedToolCall(chat.messages.at(-1));
  return false;
}

async function main(): Promise<void> {
  assertCompletedToolCall(
    await readFinalMessage({
      stream: createFreshStream(),
    }),
  );

  const readerFailed = await readerResumeFails();
  const chatFailed = await chatResumeFails();

  if (readerFailed && chatFailed) {
    throw new Error(
      'ISSUE_14027_REPRODUCED: hydrated input-streaming static tool calls fail to resume in both readUIMessageStream and Chat.resumeStream',
    );
  }

  if (readerFailed || chatFailed) {
    throw new Error(
      `Expected both resume paths to complete, but readerFailed=${readerFailed} and chatFailed=${chatFailed}.`,
    );
  }
}

await main();
