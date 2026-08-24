import { Chat } from '@ai-sdk/angular';
import type { ChatTransport, UIMessage, UIMessageChunk } from 'ai';

type Metadata = {
  someFunction?: () => void;
  cache?: WeakMap<object, unknown>;
};

type TestMessage = UIMessage<Metadata>;

type CaseResult = {
  errorName: string | undefined;
  messageCount: number;
  status: string;
  transportCalls: number;
};

function createTransport(counter: {
  calls: number;
}): ChatTransport<TestMessage> {
  return {
    sendMessages: async () => {
      counter.calls++;
      return new ReadableStream<UIMessageChunk>({
        start(controller) {
          controller.close();
        },
      });
    },
    reconnectToStream: async () => null,
  };
}

function result(
  chat: Chat<TestMessage>,
  counter: { calls: number },
): CaseResult {
  return {
    errorName: chat.error?.name,
    messageCount: chat.messages.length,
    status: chat.status,
    transportCalls: counter.calls,
  };
}

async function submitUserMetadataWithFunction(): Promise<CaseResult> {
  const counter = { calls: 0 };
  const chat = new Chat<TestMessage>({
    transport: createTransport(counter),
  });

  await chat.sendMessage({
    text: 'hello',
    metadata: { someFunction: () => {} },
  });

  return result(chat, counter);
}

async function resubmitAssistantMetadataWithWeakMap(): Promise<CaseResult> {
  const counter = { calls: 0 };
  const chat = new Chat<TestMessage>({
    messages: [
      {
        id: 'assistant-1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'hello' }],
        metadata: { cache: new WeakMap() },
      },
    ],
    transport: createTransport(counter),
  });

  await chat.sendMessage();

  return result(chat, counter);
}

async function runLiteralIssueSequence(): Promise<CaseResult> {
  const counter = { calls: 0 };
  const chat = new Chat<TestMessage>({
    messages: [
      {
        id: 'assistant-1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'hello' }],
        metadata: { someFunction: () => {} },
      },
    ],
    transport: createTransport(counter),
  });

  await chat.sendMessage({ text: 'hello' });

  return result(chat, counter);
}

function isDataCloneFailure(
  value: CaseResult,
  expectedMessageCount: number,
): boolean {
  return (
    value.errorName === 'DataCloneError' &&
    value.messageCount === expectedMessageCount &&
    value.status === 'error' &&
    value.transportCalls === 0
  );
}

function isSuccessful(
  value: CaseResult,
  expectedMessageCount: number,
): boolean {
  return (
    value.errorName === undefined &&
    value.messageCount === expectedMessageCount &&
    value.status === 'ready' &&
    value.transportCalls === 1
  );
}

async function main() {
  const nativeStructuredClone = globalThis.structuredClone;
  let structuredCloneCalls = 0;

  globalThis.structuredClone = (<T>(
    value: T,
    options?: StructuredSerializeOptions,
  ) => {
    structuredCloneCalls++;
    return nativeStructuredClone(value, options);
  }) as typeof structuredClone;

  try {
    const userFunction = await submitUserMetadataWithFunction();
    const assistantWeakMap = await resubmitAssistantMetadataWithWeakMap();
    const literalSequence = await runLiteralIssueSequence();

    console.log(
      JSON.stringify(
        {
          assistantWeakMap,
          literalSequence,
          structuredCloneCalls,
          userFunction,
        },
        null,
        2,
      ),
    );

    const expectedBehavior =
      isSuccessful(userFunction, 1) &&
      isSuccessful(assistantWeakMap, 1) &&
      isSuccessful(literalSequence, 2) &&
      structuredCloneCalls === 0;

    if (expectedBehavior) {
      console.log(
        'PASS: Angular submissions reached the transport without deep-cloning message contents.',
      );
      return;
    }

    const reportedBugObserved =
      isDataCloneFailure(userFunction, 1) &&
      isDataCloneFailure(assistantWeakMap, 1) &&
      isSuccessful(literalSequence, 2) &&
      structuredCloneCalls === 3;

    if (reportedBugObserved) {
      throw new Error(
        'ISSUE_19330_REPRODUCED: Angular Chat blocked supported submissions with DataCloneError before transport and deep-cloned an appended user message',
      );
    }

    throw new Error(
      'Unexpected outcome while checking issue #19330; neither the expected behavior nor the reported bug was observed.',
    );
  } finally {
    globalThis.structuredClone = nativeStructuredClone;
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  throw error;
});
