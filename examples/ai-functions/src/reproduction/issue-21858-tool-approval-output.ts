import assert from 'node:assert/strict';
import {
  AbstractChat,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type ChatInit,
  type ChatState,
  type ChatStatus,
  type ChatTransport,
  type UIMessage,
  type UIMessageChunk,
} from 'ai';

class ReproducedBugError extends Error {}

class MemoryChatState implements ChatState<UIMessage> {
  status: ChatStatus = 'ready';
  error: Error | undefined;
  messages: UIMessage[] = [];

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

class MemoryChat extends AbstractChat<UIMessage> {
  constructor(init: ChatInit<UIMessage>) {
    super({ ...init, state: new MemoryChatState() });
  }
}

function createStream(chunks: UIMessageChunk[]) {
  return new ReadableStream<UIMessageChunk>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

function createTransport() {
  let requestCount = 0;

  const transport: ChatTransport<UIMessage> = {
    async sendMessages() {
      requestCount++;

      if (requestCount === 1) {
        return createStream([
          { type: 'start', messageId: 'assistant-1' },
          { type: 'start-step' },
          {
            type: 'tool-input-start',
            toolCallId: 'call_1',
            toolName: 'update_note',
          },
          {
            type: 'tool-input-available',
            toolCallId: 'call_1',
            toolName: 'update_note',
            input: { id: 'n1' },
          },
          {
            type: 'tool-approval-request',
            toolCallId: 'call_1',
            approvalId: 'ap1',
          },
          { type: 'finish-step' },
          { type: 'finish', finishReason: 'tool-calls' },
        ]);
      }

      return createStream([
        { type: 'start', messageId: 'assistant-1' },
        { type: 'finish', finishReason: 'stop' },
      ]);
    },
    async reconnectToStream() {
      return null;
    },
  };

  return {
    transport,
    getRequestCount: () => requestCount,
  };
}

function getToolPart(chat: MemoryChat) {
  const part = chat.messages
    .at(-1)
    ?.parts.find(part => 'toolCallId' in part && part.toolCallId === 'call_1');
  assert.ok(part, 'missing streamed tool part');
  return part as typeof part & {
    state: string;
    approval?: { id: string; approved?: boolean };
    errorText?: string;
    output?: unknown;
  };
}

async function waitForAutomaticRequest(
  getRequestCount: () => number,
  timeoutMs = 250,
) {
  const deadline = Date.now() + timeoutMs;
  while (getRequestCount() < 2 && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}

async function runScenario(
  strayOutput:
    | { state: 'output-error'; errorText: string }
    | { state?: 'output-available'; output: unknown },
) {
  const requests = createTransport();
  let nextId = 0;
  const chat = new MemoryChat({
    id: 'chat-1',
    generateId: () => `generated-${nextId++}`,
    transport: requests.transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
  });

  await chat.sendMessage({ text: 'rename note n1' });

  const requestedPart = getToolPart(chat);
  assert.equal(requestedPart.state, 'approval-requested');
  assert.deepEqual(requestedPart.approval, { id: 'ap1' });
  assert.equal(requests.getRequestCount(), 1);

  // Both documented-safe resolutions are accepted: ignore the stray output or
  // reject it. In either case the approval must remain answerable.
  try {
    await chat.addToolOutput({
      tool: 'update_note',
      toolCallId: 'call_1',
      ...strayOutput,
    });
  } catch {
    // A rejection is an expected valid fix.
  }

  const partAfterOutput = getToolPart(chat);
  const malformedOutputPart =
    (partAfterOutput.state === 'output-error' ||
      partAfterOutput.state === 'output-available') &&
    partAfterOutput.approval?.id === 'ap1' &&
    partAfterOutput.approval.approved === undefined;

  await chat.addToolApprovalResponse({ id: 'ap1', approved: true });
  await waitForAutomaticRequest(requests.getRequestCount);

  const finalPart = getToolPart(chat);
  if (
    finalPart.state !== 'approval-responded' ||
    finalPart.approval?.approved !== true ||
    requests.getRequestCount() !== 2
  ) {
    throw new ReproducedBugError(
      `approval became unanswerable after ${strayOutput.state ?? 'output-available'}: ` +
        `state=${finalPart.state}, approved=${String(finalPart.approval?.approved)}, ` +
        `requests=${requests.getRequestCount()}, malformedOutputPart=${malformedOutputPart}`,
    );
  }
}

async function main() {
  const failures: string[] = [];

  for (const strayOutput of [
    { state: 'output-error' as const, errorText: 'client-side error' },
    { state: 'output-available' as const, output: { ok: true } },
  ]) {
    try {
      await runScenario(strayOutput);
    } catch (error) {
      if (!(error instanceof ReproducedBugError)) {
        throw error;
      }
      failures.push(error.message);
    }
  }

  if (failures.length > 0) {
    console.error(
      'ISSUE_21858: addToolOutput makes a pending approval unanswerable\n' +
        failures.map(failure => `- ${failure}`).join('\n'),
    );
    process.exitCode = 1;
    return;
  }

  console.log('Issue #21858 did not reproduce.');
}

main().catch(error => {
  console.error('REPRODUCTION_HARNESS_ERROR', error);
  process.exitCode = 2;
});
