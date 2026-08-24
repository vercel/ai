import type { Chat as AngularChat } from '../../../../packages/angular/dist/index.mjs';
import type { ChatTransport, UIMessage, UIMessageChunk } from 'ai';

type Metadata = {
  callback?: () => void;
  cache?: WeakMap<object, unknown>;
};

type TestMessage = UIMessage<Metadata>;

type ScenarioResult = {
  errorName: string | undefined;
  messageCount: number;
  status: string;
  transportCalls: number;
};

function emptyStream(): ReadableStream<UIMessageChunk> {
  return new ReadableStream({
    start(controller) {
      controller.close();
    },
  });
}

function createTransport(counter: {
  calls: number;
}): ChatTransport<TestMessage> {
  return {
    async sendMessages() {
      counter.calls++;
      return emptyStream();
    },
    async reconnectToStream() {
      return null;
    },
  };
}

async function loadAngularChat(): Promise<typeof AngularChat> {
  const sourceModule = '../../../../packages/angular/src/lib/chat.ng.ts';
  return ((await import(sourceModule)) as { Chat: typeof AngularChat }).Chat;
}

async function submitTextAfterAssistant(
  Chat: typeof AngularChat,
): Promise<ScenarioResult> {
  const counter = { calls: 0 };
  const chat = new Chat<TestMessage>({
    id: 'literal-sequence',
    generateId: () => 'new-user-message',
    messages: [
      {
        id: 'assistant-message',
        role: 'assistant',
        parts: [{ type: 'text', text: 'hello' }],
        metadata: { callback: () => undefined },
      },
    ],
    transport: createTransport(counter),
  });

  await chat.sendMessage({ text: 'hello' });

  return {
    errorName: chat.error?.name,
    messageCount: chat.messages.length,
    status: chat.status,
    transportCalls: counter.calls,
  };
}

async function submitUserFunctionMetadata(
  Chat: typeof AngularChat,
): Promise<ScenarioResult> {
  const counter = { calls: 0 };
  const chat = new Chat<TestMessage>({
    id: 'user-function-metadata',
    generateId: () => 'user-message',
    transport: createTransport(counter),
  });

  await chat.sendMessage({
    text: 'hello',
    metadata: { callback: () => undefined },
  });

  return {
    errorName: chat.error?.name,
    messageCount: chat.messages.length,
    status: chat.status,
    transportCalls: counter.calls,
  };
}

async function resubmitAssistantWeakMapMetadata(
  Chat: typeof AngularChat,
): Promise<ScenarioResult> {
  const counter = { calls: 0 };
  const chat = new Chat<TestMessage>({
    id: 'assistant-weak-map-metadata',
    generateId: () => 'unused-id',
    messages: [
      {
        id: 'assistant-message',
        role: 'assistant',
        parts: [{ type: 'text', text: 'hello' }],
        metadata: { cache: new WeakMap() },
      },
    ],
    transport: createTransport(counter),
  });

  await chat.sendMessage();

  return {
    errorName: chat.error?.name,
    messageCount: chat.messages.length,
    status: chat.status,
    transportCalls: counter.calls,
  };
}

function requestSucceeded(result: ScenarioResult, messageCount: number) {
  return (
    result.errorName == null &&
    result.messageCount === messageCount &&
    result.status === 'ready' &&
    result.transportCalls === 1
  );
}

async function main() {
  const Chat = await loadAngularChat();
  const originalStructuredClone = globalThis.structuredClone;
  const clonedRoles: Array<TestMessage['role'] | 'non-message'> = [];

  globalThis.structuredClone = ((
    value: unknown,
    options?: StructuredSerializeOptions,
  ) => {
    clonedRoles.push(
      value != null &&
        typeof value === 'object' &&
        'role' in value &&
        (value.role === 'user' ||
          value.role === 'assistant' ||
          value.role === 'system')
        ? value.role
        : 'non-message',
    );
    return originalStructuredClone(value, options);
  }) as typeof structuredClone;

  try {
    const literalSequence = await submitTextAfterAssistant(Chat);
    const userFunctionMetadata = await submitUserFunctionMetadata(Chat);
    const assistantWeakMapMetadata =
      await resubmitAssistantWeakMapMetadata(Chat);

    const expectedBehavior =
      requestSucceeded(literalSequence, 2) &&
      requestSucceeded(userFunctionMetadata, 1) &&
      requestSucceeded(assistantWeakMapMetadata, 1) &&
      clonedRoles.length === 0;

    if (expectedBehavior) {
      console.log(
        'PASS: Angular Chat submitted non-cloneable metadata without deep-cloning messages.',
      );
      return;
    }

    const reportedFailure =
      requestSucceeded(literalSequence, 2) &&
      userFunctionMetadata.errorName === 'DataCloneError' &&
      userFunctionMetadata.messageCount === 1 &&
      userFunctionMetadata.status === 'error' &&
      userFunctionMetadata.transportCalls === 0 &&
      assistantWeakMapMetadata.errorName === 'DataCloneError' &&
      assistantWeakMapMetadata.messageCount === 1 &&
      assistantWeakMapMetadata.status === 'error' &&
      assistantWeakMapMetadata.transportCalls === 0 &&
      clonedRoles.join(',') === 'user,user,assistant';

    if (reportedFailure) {
      console.error(
        'ISSUE_19330_REPRODUCED: Angular Chat rejected non-cloneable message metadata with DataCloneError before transport invocation',
      );
      process.exitCode = 1;
      return;
    }

    console.error(
      'UNEXPECTED_REPRODUCTION_RESULT',
      JSON.stringify({
        assistantWeakMapMetadata,
        clonedRoles,
        literalSequence,
        userFunctionMetadata,
      }),
    );
    process.exitCode = 2;
  } finally {
    globalThis.structuredClone = originalStructuredClone;
  }
}

main().catch(error => {
  console.error('UNEXPECTED_REPRODUCTION_ERROR', error);
  process.exitCode = 2;
});
