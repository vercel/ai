import assert from 'node:assert/strict';
import {
  AbstractChat,
  lastAssistantMessageIsCompleteWithToolCalls,
  type ChatState,
  type ChatStatus,
  type ChatTransport,
  type UIMessage,
  type UIMessageChunk,
} from 'ai';

type ToolKind = 'static' | 'dynamic';
type FinalState = 'output-available' | 'output-error';

const failureSignal =
  'ISSUE_22595_REPRODUCED: final addToolOutput retained preliminary=true and blocked automatic continuation';

class ReproductionState implements ChatState<UIMessage> {
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
    this.messages = [
      ...this.messages.slice(0, index),
      message,
      ...this.messages.slice(index + 1),
    ];
  };

  snapshot = <T>(value: T): T => structuredClone(value);
}

class ReproductionChat extends AbstractChat<UIMessage> {}

function toolPart(
  kind: ToolKind,
): Extract<UIMessage['parts'][number], { state: 'output-available' }> {
  return {
    ...(kind === 'static'
      ? { type: 'tool-task' as const }
      : { type: 'dynamic-tool' as const, toolName: 'task' }),
    toolCallId: 'call',
    state: 'output-available',
    input: {},
    output: 'working',
    preliminary: true,
  };
}

function findToolPart(messages: UIMessage[]) {
  for (const message of messages) {
    for (const part of message.parts) {
      if ('toolCallId' in part && part.toolCallId === 'call') {
        return part;
      }
    }
  }
  throw new Error('Harness error: tool part was not found');
}

async function waitForToolPart(chat: ReproductionChat) {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    try {
      return findToolPart(chat.messages);
    } catch {
      await new Promise(resolve => setTimeout(resolve, 5));
    }
  }
  throw new Error(
    'Harness error: timed out waiting for the streamed tool part',
  );
}

function finalOutput(finalState: FinalState) {
  return finalState === 'output-error'
    ? ({
        tool: 'task',
        toolCallId: 'call',
        state: 'output-error',
        errorText: 'failed',
      } as const)
    : ({
        tool: 'task',
        toolCallId: 'call',
        output: 'finished',
      } as const);
}

async function checkStoredMessage(
  kind: ToolKind,
  finalState: FinalState,
  primaryFailures: string[],
  staleFlagFailures: string[],
) {
  const state = new ReproductionState([
    {
      id: 'message',
      role: 'assistant',
      parts: [toolPart(kind)],
    },
  ]);
  const chat = new ReproductionChat({ state });

  await chat.addToolOutput(finalOutput(finalState));

  const part = findToolPart(chat.messages);
  assert.equal(part.state, finalState);
  if (finalState === 'output-available') {
    assert.equal('output' in part ? part.output : undefined, 'finished');
  } else {
    assert.equal('errorText' in part ? part.errorText : undefined, 'failed');
  }

  const preliminary = 'preliminary' in part ? part.preliminary : undefined;
  if (preliminary === true) {
    if (finalState === 'output-available') {
      primaryFailures.push(
        `stored ${kind} result remained preliminary and incomplete`,
      );
    } else {
      staleFlagFailures.push(
        `stored ${kind} output-error retained preliminary=true`,
      );
    }
  }

  const complete = lastAssistantMessageIsCompleteWithToolCalls({
    messages: chat.messages,
  });
  if (!complete) {
    primaryFailures.push(
      `stored ${kind} ${finalState} was not considered complete`,
    );
  }
}

async function checkActiveResponse(
  kind: ToolKind,
  finalState: FinalState,
  primaryFailures: string[],
  staleFlagFailures: string[],
) {
  let firstController:
    | ReadableStreamDefaultController<UIMessageChunk>
    | undefined;
  let sendCount = 0;
  const finishedMessages: UIMessage[] = [];

  const transport: ChatTransport<UIMessage> = {
    sendMessages: async () => {
      sendCount++;

      if (sendCount > 2) {
        throw new Error('Harness error: duplicate automatic continuation');
      }

      if (sendCount === 2) {
        return new ReadableStream<UIMessageChunk>({
          start(controller) {
            controller.enqueue({ type: 'start' });
            controller.enqueue({ type: 'start-step' });
            controller.enqueue({ type: 'text-start', id: 'text' });
            controller.enqueue({
              type: 'text-delta',
              id: 'text',
              delta: 'continued',
            });
            controller.enqueue({ type: 'text-end', id: 'text' });
            controller.enqueue({ type: 'finish-step' });
            controller.enqueue({ type: 'finish' });
            controller.close();
          },
        });
      }

      return new ReadableStream<UIMessageChunk>({
        start(controller) {
          firstController = controller;
          controller.enqueue({ type: 'start' });
          controller.enqueue({ type: 'start-step' });
          controller.enqueue({
            type: 'tool-input-available',
            toolCallId: 'call',
            toolName: 'task',
            input: {},
            dynamic: kind === 'dynamic',
          });
          controller.enqueue({
            type: 'tool-output-available',
            toolCallId: 'call',
            output: 'working',
            preliminary: true,
          });
        },
      });
    },
    reconnectToStream: async () => null,
  };

  const state = new ReproductionState([]);
  let id = 0;
  const chat = new ReproductionChat({
    state,
    transport,
    generateId: () => `id-${id++}`,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    onFinish: ({ message }) => {
      finishedMessages.push(structuredClone(message));
    },
  });

  const request = chat.sendMessage({ text: 'start' });
  await waitForToolPart(chat);
  await chat.addToolOutput(finalOutput(finalState));

  const storedPart = findToolPart(chat.messages);
  assert.equal(storedPart.state, finalState);

  firstController?.enqueue({ type: 'finish-step' });
  firstController?.enqueue({ type: 'finish' });
  firstController?.close();
  await request;

  assert.ok(
    finishedMessages[0],
    'Harness error: active response did not finish',
  );
  const activePart = findToolPart([finishedMessages[0]]);
  assert.equal(activePart.state, finalState);

  const storedPreliminary =
    'preliminary' in storedPart ? storedPart.preliminary : undefined;
  const activePreliminary =
    'preliminary' in activePart ? activePart.preliminary : undefined;

  if (storedPreliminary === true || activePreliminary === true) {
    if (finalState === 'output-available') {
      primaryFailures.push(
        `active ${kind} result remained preliminary after finalization`,
      );
    } else {
      staleFlagFailures.push(
        `active ${kind} output-error retained preliminary=true`,
      );
    }
  }

  if (sendCount !== 2) {
    if (finalState === 'output-available' && sendCount === 1) {
      primaryFailures.push(
        `active ${kind} final result triggered ${sendCount - 1} automatic continuations instead of 1`,
      );
    } else {
      assert.equal(
        sendCount,
        2,
        `Expected exactly one automatic continuation for active ${kind} ${finalState}`,
      );
    }
  }
}

async function main() {
  const primaryFailures: string[] = [];
  const staleFlagFailures: string[] = [];

  for (const kind of ['static', 'dynamic'] as const) {
    for (const finalState of ['output-available', 'output-error'] as const) {
      await checkStoredMessage(
        kind,
        finalState,
        primaryFailures,
        staleFlagFailures,
      );
      await checkActiveResponse(
        kind,
        finalState,
        primaryFailures,
        staleFlagFailures,
      );
    }
  }

  if (primaryFailures.length > 0) {
    console.error(failureSignal);
    for (const failure of [...primaryFailures, ...staleFlagFailures]) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  assert.deepEqual(
    staleFlagFailures,
    [],
    'Final output-error states must not retain preliminary=true',
  );

  console.log(
    'Final tool outputs cleared preliminary state and automatic continuation ran exactly once.',
  );
}

await main();
