import { strict as assert } from 'node:assert';
import type {
  AbstractChat,
  ChatInit,
  ChatTransport,
  UIMessage,
  UIMessageChunk,
} from 'ai';

type AngularChatConstructor = new <UI_MESSAGE extends UIMessage = UIMessage>(
  init: ChatInit<UI_MESSAGE>,
) => AbstractChat<UI_MESSAGE>;

const angularSourceUrl = new URL(
  '../../../../packages/angular/src/index.ts',
  import.meta.url,
);
const { Chat } = (await import(angularSourceUrl.href)) as {
  Chat: AngularChatConstructor;
};

type Metadata = {
  someFunction?: () => void;
};

type Message = UIMessage<Metadata>;

function createTransport() {
  let sendCount = 0;

  const transport: ChatTransport<Message> = {
    async sendMessages() {
      sendCount++;
      return new ReadableStream<UIMessageChunk>({
        start(controller) {
          controller.close();
        },
      });
    },
    async reconnectToStream() {
      return null;
    },
  };

  return {
    transport,
    get sendCount() {
      return sendCount;
    },
  };
}

async function submitNewUserMessageAfterAssistant() {
  const request = createTransport();
  const chat = new Chat<Message>({
    generateId: () => 'generated-id',
    messages: [
      {
        id: 'assistant-1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'previous response' }],
        metadata: { someFunction: () => undefined },
      },
    ],
    transport: request.transport,
  });

  await chat.sendMessage({ text: 'hello' });

  assert.equal(
    chat.error,
    undefined,
    'A non-cloneable value on the previous assistant message must not prevent a new user message from being submitted.',
  );
  assert.equal(request.sendCount, 1);
}

async function observeNormalUserSubmitClone() {
  const request = createTransport();
  const chat = new Chat<Message>({
    generateId: () => 'generated-id',
    transport: request.transport,
  });
  const originalStructuredClone = globalThis.structuredClone;
  let clonedSubmittedUserMessage = false;

  globalThis.structuredClone = (<T>(
    value: T,
    options?: StructuredSerializeOptions,
  ): T => {
    if (
      value != null &&
      typeof value === 'object' &&
      'role' in value &&
      value.role === 'user'
    ) {
      clonedSubmittedUserMessage = true;
    }
    return originalStructuredClone(value, options);
  }) as typeof structuredClone;

  try {
    await chat.sendMessage({ text: 'cloneable user message' });
  } finally {
    globalThis.structuredClone = originalStructuredClone;
  }

  assert.equal(chat.error, undefined);
  assert.equal(request.sendCount, 1);
  return clonedSubmittedUserMessage;
}

async function resubmitAssistantMessage() {
  const request = createTransport();
  const chat = new Chat<Message>({
    generateId: () => 'generated-id',
    messages: [
      {
        id: 'assistant-1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'response to continue' }],
        metadata: { someFunction: () => undefined },
      },
    ],
    transport: request.transport,
  });

  await chat.sendMessage();

  return { chat, request };
}

async function submitUserMessageWithMetadata() {
  const request = createTransport();
  const chat = new Chat<Message>({
    generateId: () => 'generated-id',
    transport: request.transport,
  });

  await chat.sendMessage({
    text: 'hello',
    metadata: { someFunction: () => undefined },
  });

  return { chat, request };
}

function isStructuredCloneFailure(
  result: Awaited<ReturnType<typeof resubmitAssistantMessage>>,
) {
  return (
    result.chat.status === 'error' &&
    result.chat.error?.name === 'DataCloneError' &&
    result.request.sendCount === 0
  );
}

async function main() {
  // This is the issue's exact sequence. The newly appended user message is the
  // value snapshot by AbstractChat, so the previous assistant metadata is not
  // what triggers the failure.
  await submitNewUserMessageAfterAssistant();

  const clonedNormalUserMessage = await observeNormalUserSubmitClone();
  if (clonedNormalUserMessage) {
    console.log(
      'Secondary observation: Angular deep-cloned the submitted user message before calling the transport.',
    );
  }

  // Both of these supported submit paths leave a non-cloneable value on the
  // last message that AngularChatState.snapshot receives.
  const assistantResult = await resubmitAssistantMessage();
  const userResult = await submitUserMessageWithMetadata();

  const assistantFailed = isStructuredCloneFailure(assistantResult);
  const userFailed = isStructuredCloneFailure(userResult);

  if (assistantFailed && userFailed) {
    throw new Error(
      'ISSUE_19330_REPRODUCED: Angular Chat rejects submit-message requests with DataCloneError before the transport is called.',
    );
  }

  assert.equal(
    assistantResult.chat.error,
    undefined,
    'Resubmitting an assistant message with application metadata should succeed.',
  );
  assert.equal(
    assistantResult.request.sendCount,
    1,
    'The assistant-message request should reach the transport.',
  );
  assert.equal(
    userResult.chat.error,
    undefined,
    'Submitting a user message with application metadata should succeed.',
  );
  assert.equal(
    userResult.request.sendCount,
    1,
    'The user-message request should reach the transport.',
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
