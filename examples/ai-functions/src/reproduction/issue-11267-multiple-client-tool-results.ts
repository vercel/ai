import { Chat } from '../../../../packages/react/dist/index.mjs';
import {
  isToolOrDynamicToolUIPart,
  lastAssistantMessageIsCompleteWithToolCalls,
  type ChatTransport,
  type UIMessage,
  type UIMessageChunk,
} from '../../../../packages/ai/dist/index.mjs';

type Scenario = {
  calls: number;
  operation: 'create' | 'delete';
  outputErrors?: Set<number>;
  repetitions: number;
};

const scenarios: Scenario[] = [
  { calls: 2, operation: 'create', repetitions: 10 },
  { calls: 5, operation: 'create', repetitions: 4 },
  {
    calls: 5,
    operation: 'create',
    outputErrors: new Set([1, 3]),
    repetitions: 1,
  },
  {
    calls: 31,
    operation: 'delete',
    outputErrors: new Set([7, 23]),
    repetitions: 1,
  },
];

function streamChunks(
  chunks: UIMessageChunk[],
): ReadableStream<UIMessageChunk> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

function delay(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

class ScenarioTransport implements ChatTransport<UIMessage> {
  readonly requests: UIMessage[][] = [];

  constructor(
    private readonly calls: number,
    private readonly operation: Scenario['operation'],
  ) {}

  async sendMessages({
    messages,
  }: Parameters<ChatTransport<UIMessage>['sendMessages']>[0]) {
    this.requests.push(structuredClone(messages));

    if (this.requests.length === 1) {
      const chunks: UIMessageChunk[] = [
        { type: 'start' },
        { type: 'start-step' },
      ];

      for (let index = 0; index < this.calls; index++) {
        chunks.push({
          type: 'tool-input-available',
          toolCallId: `apply-patch-${index}`,
          toolName: 'apply_patch',
          input: {
            operation: this.operation,
            path: `generated/file-${index}.ts`,
          },
        });
      }

      chunks.push(
        { type: 'finish-step' },
        { type: 'finish', finishReason: 'tool-calls' },
      );

      return streamChunks(chunks);
    }

    invariant(
      this.requests.length === 2,
      `unexpected request ${this.requests.length}`,
    );

    return streamChunks([
      { type: 'start' },
      { type: 'start-step' },
      { type: 'text-start', id: 'follow-up-text' },
      {
        type: 'text-delta',
        id: 'follow-up-text',
        delta: 'All patches processed.',
      },
      { type: 'text-end', id: 'follow-up-text' },
      { type: 'finish-step' },
      { type: 'finish', finishReason: 'stop' },
    ]);
  }

  async reconnectToStream() {
    return null;
  }
}

async function runScenario({
  calls,
  operation,
  outputErrors = new Set(),
  run,
}: Omit<Scenario, 'repetitions'> & { run: number }) {
  const transport = new ScenarioTransport(calls, operation);
  const toolResultPromises: Promise<void>[] = [];
  const observedErrors: Error[] = [];
  let onToolCallCount = 0;
  let id = 0;
  let chat: Chat<UIMessage>;

  chat = new Chat({
    id: `issue-11267-${operation}-${calls}-${run}`,
    generateId: () => `message-${id++}`,
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    onError: error => {
      observedErrors.push(error);
    },
    onToolCall: async ({ toolCall }) => {
      const index = Number(toolCall.toolCallId.split('-').at(-1));
      onToolCallCount++;

      // Match the reported fast, sequential client-side execution. Do not await
      // addToolResult inside onToolCall because both use Chat's serial executor.
      await delay(20);

      const resultPromise = outputErrors.has(index)
        ? chat.addToolResult({
            state: 'output-error',
            tool: 'apply_patch',
            toolCallId: toolCall.toolCallId,
            errorText: `apply patch failed for ${index}`,
          })
        : chat.addToolResult({
            tool: 'apply_patch',
            toolCallId: toolCall.toolCallId,
            output: {
              operation,
              path: `generated/file-${index}.ts`,
              success: true,
            },
          });

      toolResultPromises.push(resultPromise);
    },
  });

  await chat.sendMessage({ text: `Run ${calls} ${operation} patches` });
  await Promise.all(toolResultPromises);

  invariant(
    observedErrors.length === 0,
    `unexpected chat error: ${observedErrors[0]?.message}`,
  );
  invariant(
    chat.error == null,
    `chat ended with error: ${chat.error?.message}`,
  );
  invariant(chat.status === 'ready', `chat status was ${chat.status}`);
  invariant(
    onToolCallCount === calls,
    `onToolCall ran ${onToolCallCount} times instead of ${calls}`,
  );
  invariant(
    toolResultPromises.length === calls,
    `addToolResult ran ${toolResultPromises.length} times instead of ${calls}`,
  );
  invariant(
    transport.requests.length === 2,
    `expected one automatic follow-up, received ${transport.requests.length - 1}`,
  );

  const submittedAssistantMessage = transport.requests[1].at(-1);
  invariant(
    submittedAssistantMessage?.role === 'assistant',
    'automatic follow-up did not submit the assistant tool-call message',
  );

  const submittedToolParts = submittedAssistantMessage.parts.filter(
    isToolOrDynamicToolUIPart,
  );
  invariant(
    submittedToolParts.length === calls,
    `follow-up contained ${submittedToolParts.length} tool parts instead of ${calls}`,
  );
  invariant(
    submittedToolParts.every(
      part =>
        part.state === 'output-available' || part.state === 'output-error',
    ),
    'automatic follow-up contained an incomplete tool part',
  );
  invariant(
    submittedToolParts.every(part =>
      part.state === 'output-available'
        ? 'output' in part
        : 'errorText' in part,
    ),
    'a completed tool part was missing its output or errorText',
  );
}

async function main() {
  let runs = 0;
  let toolCalls = 0;

  for (const scenario of scenarios) {
    for (let run = 0; run < scenario.repetitions; run++) {
      await runScenario({ ...scenario, run });
      runs++;
      toolCalls += scenario.calls;
    }
  }

  console.log(
    `issue-11267 could not reproduce: ${runs} runs, ${toolCalls} apply_patch calls, all results complete, one automatic follow-up per run, final status ready`,
  );
}

main().catch(error => {
  console.error(error);
  (
    globalThis as typeof globalThis & {
      process: { exitCode?: number };
    }
  ).process.exitCode = 1;
});
