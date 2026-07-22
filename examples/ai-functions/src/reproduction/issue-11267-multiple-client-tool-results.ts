import {
  isToolUIPart,
  lastAssistantMessageIsCompleteWithToolCalls,
  type ChatTransport,
  type UIMessage,
  type UIMessageChunk,
} from 'ai';
import { Chat } from '../../../../packages/react/dist/index.mjs';

type ApplyPatchMessage = UIMessage<
  unknown,
  never,
  {
    apply_patch: {
      input: {
        operation: 'create' | 'delete';
        path: string;
      };
      output: {
        ok: true;
        operation: 'create' | 'delete';
        path: string;
      };
    };
  }
>;

type Scenario = {
  name: string;
  callCount: number;
  operation: 'create' | 'delete';
  errorIndexes?: Set<number>;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function streamChunks(chunks: UIMessageChunk[]) {
  return new ReadableStream<UIMessageChunk>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

class ScenarioTransport implements ChatTransport<ApplyPatchMessage> {
  requestCount = 0;
  submittedMessages: ApplyPatchMessage[][] = [];

  constructor(
    private readonly scenario: Scenario,
    private readonly completedToolResultIds: Set<string>,
  ) {}

  async sendMessages({
    messages,
  }: Parameters<ChatTransport<ApplyPatchMessage>['sendMessages']>[0]) {
    this.requestCount++;
    this.submittedMessages.push(structuredClone(messages));

    if (this.requestCount === 1) {
      return streamChunks([
        { type: 'start' },
        { type: 'start-step' },
        ...Array.from({ length: this.scenario.callCount }, (_, index) => ({
          type: 'tool-input-available' as const,
          toolCallId: `${this.scenario.name}-call-${index}`,
          toolName: 'apply_patch',
          input: {
            operation: this.scenario.operation,
            path: `/tmp/${this.scenario.name}-${index}.txt`,
          },
        })),
        { type: 'finish-step' },
        { type: 'finish', finishReason: 'tool-calls' },
      ]);
    }

    if (this.requestCount === 2) {
      assert(
        this.completedToolResultIds.size === this.scenario.callCount,
        `${this.scenario.name}: automatic follow-up started before every addToolResult promise completed`,
      );

      return streamChunks([
        { type: 'start' },
        { type: 'start-step' },
        { type: 'text-start', id: `${this.scenario.name}-text` },
        {
          type: 'text-delta',
          id: `${this.scenario.name}-text`,
          delta: 'done',
        },
        { type: 'text-end', id: `${this.scenario.name}-text` },
        { type: 'finish-step' },
        { type: 'finish', finishReason: 'stop' },
      ]);
    }

    throw new Error(
      `${this.scenario.name}: expected one automatic follow-up, received request ${this.requestCount}`,
    );
  }

  async reconnectToStream() {
    return null;
  }
}

async function runScenario(scenario: Scenario) {
  const completedToolResultIds = new Set<string>();
  const toolResultPromises: Promise<void>[] = [];
  const errors: Error[] = [];
  let activeExecutions = 0;
  let maxActiveExecutions = 0;
  let finishCount = 0;

  const transport = new ScenarioTransport(scenario, completedToolResultIds);
  let chat: Chat<ApplyPatchMessage>;

  chat = new Chat<ApplyPatchMessage>({
    id: `issue-11267-${scenario.name}`,
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    onError: error => {
      errors.push(error);
    },
    onFinish: () => {
      finishCount++;
    },
    onToolCall: async ({ toolCall }) => {
      assert(!toolCall.dynamic, `${scenario.name}: unexpected dynamic tool`);
      assert(
        toolCall.toolName === 'apply_patch',
        `${scenario.name}: unexpected tool ${toolCall.toolName}`,
      );

      activeExecutions++;
      maxActiveExecutions = Math.max(maxActiveExecutions, activeExecutions);
      await new Promise(resolve => setTimeout(resolve, 20));

      const index = Number(toolCall.toolCallId.split('-').at(-1));
      const resultPromise = scenario.errorIndexes?.has(index)
        ? chat.addToolResult({
            state: 'output-error',
            tool: 'apply_patch',
            toolCallId: toolCall.toolCallId,
            errorText: `patch failed for ${toolCall.input.path}`,
          })
        : chat.addToolResult({
            tool: 'apply_patch',
            toolCallId: toolCall.toolCallId,
            output: {
              ok: true,
              operation: toolCall.input.operation,
              path: toolCall.input.path,
            },
          });

      toolResultPromises.push(
        Promise.resolve(resultPromise).then(() => {
          completedToolResultIds.add(toolCall.toolCallId);
        }),
      );
      activeExecutions--;
    },
  });

  await chat.sendMessage({ text: `Run ${scenario.name}` });
  await Promise.all(toolResultPromises);

  const primaryError = errors.find(error =>
    error.message.includes('No tool output found for'),
  );
  if (primaryError) {
    throw new Error(`Reproduced issue #11267: ${primaryError.message}`);
  }

  assert(
    errors.length === 0,
    `${scenario.name}: unexpected chat error: ${errors[0]?.message}`,
  );
  assert(
    maxActiveExecutions === 1,
    `${scenario.name}: client tools executed concurrently`,
  );
  assert(
    transport.requestCount === 2,
    `${scenario.name}: expected exactly one automatic follow-up, observed ${transport.requestCount - 1}`,
  );
  assert(
    finishCount === 2,
    `${scenario.name}: expected two completed responses, observed ${finishCount}`,
  );
  assert(
    chat.status === 'ready',
    `${scenario.name}: expected ready status, observed ${chat.status}`,
  );

  const firstResponseToolParts = transport.submittedMessages[1]
    .flatMap(message => message.parts)
    .filter(isToolUIPart)
    .filter(part => part.type === 'tool-apply_patch');

  assert(
    firstResponseToolParts.length === scenario.callCount,
    `${scenario.name}: follow-up contained ${firstResponseToolParts.length} of ${scenario.callCount} tool calls`,
  );
  assert(
    firstResponseToolParts.every(
      part =>
        (part.state === 'output-available' && part.output != null) ||
        (part.state === 'output-error' && part.errorText.length > 0),
    ),
    `${scenario.name}: follow-up contained an incomplete apply_patch tool part`,
  );

  return {
    name: scenario.name,
    toolCalls: scenario.callCount,
    outputErrors: scenario.errorIndexes?.size ?? 0,
    automaticFollowUps: transport.requestCount - 1,
    finalStatus: chat.status,
  };
}

async function main() {
  const scenarios: Scenario[] = [
    ...Array.from({ length: 10 }, (_, index) => ({
      name: `create-2-run-${index + 1}`,
      callCount: 2,
      operation: 'create' as const,
    })),
    ...Array.from({ length: 5 }, (_, index) => ({
      name: `create-5-run-${index + 1}`,
      callCount: 5,
      operation: 'create' as const,
      errorIndexes: index === 4 ? new Set([1, 3]) : undefined,
    })),
    {
      name: 'delete-31-run-1',
      callCount: 31,
      operation: 'delete',
    },
  ];

  const results = [];
  for (const scenario of scenarios) {
    results.push(await runScenario(scenario));
  }

  console.log(
    JSON.stringify(
      {
        issue: 11267,
        scenarioCount: results.length,
        toolCallCount: results.reduce(
          (sum, result) => sum + result.toolCalls,
          0,
        ),
        outputErrorCount: results.reduce(
          (sum, result) => sum + result.outputErrors,
          0,
        ),
        automaticFollowUpCount: results.reduce(
          (sum, result) => sum + result.automaticFollowUps,
          0,
        ),
        allReady: results.every(result => result.finalStatus === 'ready'),
        observedMissingToolOutputError: false,
      },
      null,
      2,
    ),
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
