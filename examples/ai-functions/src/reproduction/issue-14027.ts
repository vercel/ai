import {
  AbstractChat,
  type ChatState,
  type ChatStatus,
  type ChatTransport,
  type UIMessage,
  type UIMessageChunk,
} from 'ai';

const toolCallId = 'tool-call-14027';
const failureSignal =
  'ISSUE 14027 REPRODUCED: resumeStream failed to continue the hydrated static tool call';

class InMemoryChatState implements ChatState<UIMessage> {
  status: ChatStatus = 'ready';
  error: Error | undefined;

  constructor(public messages: UIMessage[]) {}

  pushMessage = (message: UIMessage) => {
    this.messages = [...this.messages, message];
  };

  popMessage = () => {
    this.messages = this.messages.slice(0, -1);
  };

  replaceMessage = (index: number, message: UIMessage) => {
    this.messages = this.messages.map((current, currentIndex) =>
      currentIndex === index ? message : current,
    );
  };

  snapshot = <T>(value: T): T => structuredClone(value);
}

class ReproductionChat extends AbstractChat<UIMessage> {}

function createResumeStream() {
  return new ReadableStream<UIMessageChunk>({
    start(controller) {
      controller.enqueue({
        type: 'tool-input-delta',
        toolCallId,
        inputTextDelta: 'ly plan"}',
      });
      controller.enqueue({
        type: 'tool-input-available',
        toolCallId,
        toolName: 'create_document',
        input: { title: 'Quarterly plan' },
      });
      controller.enqueue({ type: 'finish' });
      controller.close();
    },
  });
}

async function main() {
  const hydratedAssistantMessage = {
    id: 'assistant-14027',
    role: 'assistant',
    parts: [
      {
        type: 'tool-create_document',
        state: 'input-streaming',
        toolCallId,
        rawInput: '{"title":"Quarter',
      },
    ],
  } as unknown as UIMessage;

  const state = new InMemoryChatState([hydratedAssistantMessage]);
  let observedError: Error | undefined;

  const transport: ChatTransport<UIMessage> = {
    sendMessages: async () => {
      throw new Error('sendMessages is not used by this resume reproduction');
    },
    reconnectToStream: async () => createResumeStream(),
  };

  const chat = new ReproductionChat({
    id: 'chat-14027',
    generateId: () => 'generated-message-14027',
    state,
    transport,
    onError: error => {
      observedError = error;
    },
  });

  await chat.resumeStream();

  if (
    chat.status === 'error' &&
    observedError?.message.includes(
      `Received tool-input-delta for missing tool call with ID "${toolCallId}"`,
    )
  ) {
    console.error(`${failureSignal}: ${observedError.message}`);
    process.exitCode = 1;
    return;
  }

  if (chat.status !== 'ready' || chat.error != null) {
    throw new Error(
      `Unexpected resume result: status=${chat.status}, error=${chat.error?.message}`,
    );
  }

  const resumedToolPart = chat.messages
    .flatMap(message => message.parts)
    .find(
      part =>
        part.type === 'tool-create_document' &&
        'toolCallId' in part &&
        part.toolCallId === toolCallId,
    );

  if (
    resumedToolPart == null ||
    !('state' in resumedToolPart) ||
    resumedToolPart.state !== 'input-available' ||
    !('input' in resumedToolPart) ||
    (resumedToolPart.input as { title?: string }).title !== 'Quarterly plan'
  ) {
    throw new Error(
      'Resume completed without reconstructing the hydrated static tool call',
    );
  }

  console.log('Issue 14027 is fixed: the hydrated static tool call resumed.');
}

main().catch(error => {
  console.error('Unexpected reproduction harness failure:', error);
  process.exitCode = 2;
});
