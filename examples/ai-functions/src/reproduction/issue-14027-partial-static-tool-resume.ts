import {
  AbstractChat,
  readUIMessageStream,
  type ChatState,
  type ChatTransport,
  type UIMessage,
  type UIMessageChunk,
} from 'ai';

const toolCallId = 'tool-call-14027';

function createPartialMessage() {
  return {
    id: 'assistant-14027',
    role: 'assistant',
    parts: [
      {
        type: 'tool-create_document',
        toolCallId,
        state: 'input-streaming',
        input: { title: 'Hel' },
        rawInput: '{"title":"Hel',
      },
    ],
  } as unknown as UIMessage;
}

function createResumedStream() {
  return new ReadableStream<UIMessageChunk>({
    start(controller) {
      controller.enqueue({
        type: 'tool-input-delta',
        toolCallId,
        inputTextDelta: 'lo"}',
      });
      controller.enqueue({
        type: 'tool-input-available',
        toolCallId,
        toolName: 'create_document',
        input: { title: 'Hello' },
      });
      controller.close();
    },
  });
}

function hasMissingPartialToolCallError(error: unknown) {
  const errorMessage = error instanceof Error ? error.message : String(error);

  return errorMessage.includes(
    `Received tool-input-delta for missing tool call with ID "${toolCallId}"`,
  );
}

function assertCompletedToolCall(message: UIMessage | undefined) {
  const resumedToolPart = message?.parts.find(
    part =>
      part.type === 'tool-create_document' && part.toolCallId === toolCallId,
  );

  if (
    resumedToolPart?.type !== 'tool-create_document' ||
    resumedToolPart.state !== 'input-available' ||
    !resumedToolPart.input ||
    typeof resumedToolPart.input !== 'object' ||
    !('title' in resumedToolPart.input) ||
    resumedToolPart.input.title !== 'Hello'
  ) {
    throw new Error(
      'Expected the resumed static tool call to finish with input {"title":"Hello"}.',
    );
  }
}

async function readerResumeFails() {
  let finalMessage: UIMessage | undefined;

  try {
    for await (const message of readUIMessageStream({
      message: createPartialMessage(),
      stream: createResumedStream(),
      terminateOnError: true,
    })) {
      finalMessage = message;
    }
  } catch (error) {
    if (hasMissingPartialToolCallError(error)) {
      return true;
    }
    throw error;
  }

  assertCompletedToolCall(finalMessage);
  return false;
}

class ReproductionChat extends AbstractChat<UIMessage> {}

async function chatResumeFails() {
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

  if (hasMissingPartialToolCallError(chat.error)) {
    return true;
  }
  if (chat.error != null) {
    throw chat.error;
  }

  assertCompletedToolCall(chat.messages.at(-1));
  return false;
}

async function main() {
  const readerFailed = await readerResumeFails();
  const chatFailed = await chatResumeFails();

  if (readerFailed && chatFailed) {
    throw new Error(
      'ISSUE_14027_REPRODUCED: both readUIMessageStream and Chat.resumeStream rejected a delta for the hydrated input-streaming static tool call',
    );
  }

  if (readerFailed || chatFailed) {
    throw new Error(
      `Expected both resume paths to complete, but readerFailed=${readerFailed} and chatFailed=${chatFailed}.`,
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
