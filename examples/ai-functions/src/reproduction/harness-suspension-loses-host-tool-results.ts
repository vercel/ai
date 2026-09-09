import type {
  HarnessV1,
  HarnessV1ContinueTurnOptions,
  HarnessV1ContinueTurnState,
  HarnessV1NetworkSandboxSession,
  HarnessV1PromptControl,
  HarnessV1PromptTurnOptions,
  HarnessV1SandboxProvider,
  HarnessV1Session,
  HarnessV1StartOptions,
  HarnessV1StreamPart,
} from '@ai-sdk/harness';
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { tool } from 'ai';
import { z } from 'zod/v4';

const REPRODUCTION_SIGNAL =
  'ISSUE #20535 REPRODUCED: completed host tool results were lost when suspension closed the adapter channel';

type Deferred<T = void> = {
  promise: Promise<T>;
  resolve(value: T): void;
};

function deferred<T = void>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function zeroUsage() {
  return {
    inputTokens: {
      total: undefined,
      noCache: undefined,
      cacheRead: undefined,
      cacheWrite: undefined,
    },
    outputTokens: {
      total: undefined,
      text: undefined,
      reasoning: undefined,
    },
  };
}

function finishEvents(): HarnessV1StreamPart[] {
  return [
    {
      type: 'finish-step',
      finishReason: { unified: 'tool-calls', raw: 'tool_use' },
      usage: zeroUsage(),
    },
    {
      type: 'finish',
      finishReason: { unified: 'tool-calls', raw: 'tool_use' },
      totalUsage: zeroUsage(),
    },
  ];
}

function makeSandboxProvider(): HarnessV1SandboxProvider {
  const run = async () => ({ exitCode: 0, stdout: '', stderr: '' });
  const sandbox = {
    id: 'reproduction-sandbox',
    defaultWorkingDirectory: '/work',
    ports: [],
    getPortEndpoint: async () => ({ url: 'ws://example.test/' }),
    getPortUrl: async () => 'ws://example.test/',
    run,
    stop: async () => {},
    destroy: async () => {},
    restricted: () => ({ run }),
  } as unknown as HarnessV1NetworkSandboxSession;

  return {
    specificationVersion: 'harness-sandbox-v1',
    providerId: 'reproduction-sandbox',
    createSession: async () => sandbox,
    resumeSession: async () => sandbox,
  };
}

type SubmittedToolResult = Parameters<
  HarnessV1PromptControl['submitToolResult']
>[0];

function createClosingHarness(options: {
  promptEvents?: HarnessV1StreamPart[];
  promptDone?: Promise<void>;
  continueEvents: (continuationNumber: number) => HarnessV1StreamPart[];
}) {
  const closed = deferred();
  let channelClosed = false;
  let closeActiveTurn: (() => void) | undefined;
  let continuationCount = 0;
  const prompts: HarnessV1PromptTurnOptions['prompt'][] = [];
  const submittedToolResults: SubmittedToolResult[] = [];

  const createControl = (
    events: HarnessV1StreamPart[],
  ): HarnessV1PromptControl => {
    const turnDone = deferred();
    closeActiveTurn = () => turnDone.resolve();
    queueMicrotask(() => {
      for (const event of events) {
        activeEmit?.(event);
      }
      if (events.some(event => event.type === 'finish')) {
        turnDone.resolve();
      }
    });
    return {
      submitToolResult: async input => {
        if (channelClosed) {
          throw new Error(
            'SandboxChannel: cannot send tool-result — channel is closed.',
          );
        }
        submittedToolResults.push(input);
      },
      submitToolApproval: async () => {},
      done: turnDone.promise,
    };
  };

  let activeEmit: ((event: HarnessV1StreamPart) => void) | undefined;

  const createSession = (
    startOptions: HarnessV1StartOptions,
  ): HarnessV1Session => ({
    sessionId: startOptions.sessionId,
    isResume: startOptions.continueFrom != null,
    doPromptTurn: async turnOptions => {
      prompts.push(turnOptions.prompt);
      activeEmit = turnOptions.emit;
      const control = createControl(options.promptEvents ?? []);
      if (options.promptDone != null) {
        closeActiveTurn = undefined;
        return { ...control, done: options.promptDone };
      }
      return control;
    },
    doContinueTurn: async (turnOptions: HarnessV1ContinueTurnOptions) => {
      activeEmit = turnOptions.emit;
      return createControl(options.continueEvents(++continuationCount));
    },
    doSuspendTurn: async () => {
      channelClosed = true;
      closeActiveTurn?.();
      closed.resolve();
      return {
        type: 'continue-turn',
        harnessId: 'reproduction',
        specificationVersion: 'harness-v1',
        data: {},
      };
    },
    doCompact: async () => {},
    doDetach: async () => ({
      type: 'resume-session',
      harnessId: 'reproduction',
      specificationVersion: 'harness-v1',
      data: {},
    }),
    doStop: async () => ({
      type: 'resume-session',
      harnessId: 'reproduction',
      specificationVersion: 'harness-v1',
      data: {},
    }),
    doDestroy: async () => {},
  });

  const harness: HarnessV1 = {
    specificationVersion: 'harness-v1',
    harnessId: 'reproduction',
    builtinTools: {},
    doStart: async startOptions => {
      channelClosed = false;
      return createSession(startOptions);
    },
  };

  return {
    harness,
    closed: closed.promise,
    prompts,
    submittedToolResults,
  };
}

async function collectPartTypes(
  stream: AsyncIterable<{ type: string }>,
): Promise<string[]> {
  const types: string[] = [];
  for await (const part of stream) {
    types.push(part.type);
  }
  return types;
}

function pendingResultCount(state: HarnessV1ContinueTurnState): number {
  return state.pendingToolResults?.length ?? 0;
}

async function runDispatchedToolScenario(options: {
  name: string;
  count: number;
  error: boolean;
  suspendDuringValidation: boolean;
}): Promise<string[]> {
  const work = deferred();
  const started = deferred();
  const promptDone = deferred();
  const completed: string[] = [];
  let executeCount = 0;
  let validationStarted = false;

  const calls: Extract<HarnessV1StreamPart, { type: 'tool-call' }>[] =
    Array.from({ length: options.count }, (_, index) => ({
      type: 'tool-call',
      toolCallId: `call-${index}`,
      toolName: 'research',
      input: JSON.stringify({ query: String(index) }),
    }));

  const { harness, closed, prompts, submittedToolResults } =
    createClosingHarness({
      promptEvents: calls,
      promptDone: promptDone.promise,
      continueEvents: () => [
        ...calls.map(call => ({
          type: 'tool-result' as const,
          toolCallId: call.toolCallId,
          toolName: call.toolName,
          result: { answer: call.toolCallId },
        })),
        ...finishEvents(),
      ],
    });

  const execute = async ({ query }: { query: string }) => {
    executeCount += 1;
    if (executeCount === options.count) {
      started.resolve();
    }
    await work.promise;
    completed.push(query);
    if (options.error && query === '1') {
      throw new Error('tool unavailable');
    }
    return { answer: query };
  };

  const inputSchema = z.object({ query: z.string() }).refine(async () => {
    if (options.suspendDuringValidation) {
      if (!validationStarted) {
        validationStarted = true;
        started.resolve();
      }
      await work.promise;
    }
    return true;
  });

  const agent = new HarnessAgent({
    harness,
    sandbox: makeSandboxProvider(),
    tools: {
      research: tool({ inputSchema, execute }),
    },
  });
  const session = await agent.createSession();
  const first = await agent.stream({ session, prompt: 'research' });
  const firstPartsPromise = collectPartTypes(first.fullStream);

  await started.promise;
  const suspension = session.suspendTurn();
  await closed;
  work.resolve();
  promptDone.resolve();

  const continueFrom = await suspension;
  const firstParts = await firstPartsPromise;
  const resumed = await agent.createSession({
    sessionId: session.sessionId,
    continueFrom: structuredClone(continueFrom),
  });
  const second = await agent.continueStream({ session: resumed });
  const secondParts = await collectPartTypes(second.fullStream);
  const secondSteps = await second.steps;
  await resumed.destroy();

  const failures: string[] = [];
  if (completed.length !== options.count) {
    throw new Error(
      `${options.name}: expected ${options.count} completed tools, received ${completed.length}`,
    );
  }
  if (pendingResultCount(continueFrom) !== options.count) {
    failures.push(
      `${options.name}: continuation retained ${pendingResultCount(continueFrom)} of ${options.count} completed results`,
    );
  }
  if (firstParts.includes('error')) {
    failures.push(`${options.name}: the suspended stream failed`);
  }
  if (
    firstParts.filter(type => type === 'tool-result').length !==
    options.count - Number(options.error)
  ) {
    failures.push(
      `${options.name}: successful host outcomes were not retained`,
    );
  }
  if (
    firstParts.filter(type => type === 'tool-error').length !==
    Number(options.error)
  ) {
    failures.push(`${options.name}: host tool errors were not retained`);
  }
  if (submittedToolResults.length !== options.count) {
    failures.push(
      `${options.name}: resume delivered ${submittedToolResults.length} of ${options.count} saved results`,
    );
  }
  if (executeCount !== options.count) {
    failures.push(
      `${options.name}: tools executed ${executeCount} times instead of exactly ${options.count}`,
    );
  }
  if (prompts.length !== 1) {
    throw new Error(
      `${options.name}: adapter received ${prompts.length} prompts instead of one`,
    );
  }
  if (
    secondParts.includes('tool-result') ||
    secondParts.includes('tool-error')
  ) {
    failures.push(`${options.name}: resume replayed saved tool outcomes`);
  }
  if (
    secondParts.filter(type => type === 'finish-step').length !== 1 ||
    secondSteps.length !== 1
  ) {
    failures.push(`${options.name}: resumed step completion was not retained`);
  }

  return failures;
}

async function runApprovedContinuationScenario(): Promise<string[]> {
  const started = deferred();
  const work = deferred();
  let executeCount = 0;

  const { harness, closed, submittedToolResults } = createClosingHarness({
    continueEvents: continuationNumber =>
      continuationNumber === 1
        ? []
        : [
            {
              type: 'tool-result',
              toolCallId: 'approved-call',
              toolName: 'research',
              result: { answer: 'retained' },
            },
            ...finishEvents(),
          ],
  });

  const agent = new HarnessAgent({
    harness,
    sandbox: makeSandboxProvider(),
    tools: {
      research: tool({
        inputSchema: z.object({}),
        execute: async () => {
          executeCount += 1;
          started.resolve();
          await work.promise;
          return { answer: 'retained' };
        },
      }),
    },
  });

  const session = await agent.createSession({
    continueFrom: {
      type: 'continue-turn',
      harnessId: 'reproduction',
      specificationVersion: 'harness-v1',
      data: {},
      pendingToolApprovals: [
        {
          approvalId: 'approval-1',
          toolCallId: 'approved-call',
          toolName: 'research',
          input: '{}',
          kind: 'custom',
          providerExecuted: false,
        },
      ],
    },
  });
  const first = await agent.continueStream({
    session,
    toolApprovalContinuations: [
      {
        type: 'tool-approval-response',
        approvalId: 'approval-1',
        approved: true,
      },
    ],
  });
  const firstPartsPromise = collectPartTypes(first.fullStream);

  await started.promise;
  const suspension = session.suspendTurn();
  await closed;
  work.resolve();

  const continueFrom = await suspension;
  const firstParts = await firstPartsPromise;
  const resumed = await agent.createSession({
    sessionId: session.sessionId,
    continueFrom: structuredClone(continueFrom),
  });
  const second = await agent.continueStream({ session: resumed });
  const secondParts = await collectPartTypes(second.fullStream);
  const secondSteps = await second.steps;
  await resumed.destroy();

  const failures: string[] = [];
  if (pendingResultCount(continueFrom) !== 1) {
    failures.push(
      `approved continuation: continuation retained ${pendingResultCount(continueFrom)} of 1 completed results`,
    );
  }
  if (continueFrom.pendingToolApprovals != null) {
    failures.push(
      'approved continuation: the settled approval remained pending after suspension',
    );
  }
  if (firstParts.includes('error')) {
    failures.push('approved continuation: the suspended stream failed');
  }
  if (executeCount !== 1) {
    failures.push(
      `approved continuation: tool executed ${executeCount} times instead of once`,
    );
  }
  if (submittedToolResults.length !== 1) {
    failures.push(
      `approved continuation: resume delivered ${submittedToolResults.length} of 1 saved results`,
    );
  }
  if (
    secondParts.filter(type => type === 'finish-step').length !== 1 ||
    secondSteps.length !== 1
  ) {
    failures.push(
      'approved continuation: resumed step completion was not retained',
    );
  }

  return failures;
}

async function main() {
  const failures = [
    ...(await runDispatchedToolScenario({
      name: 'single host tool',
      count: 1,
      error: false,
      suspendDuringValidation: false,
    })),
    ...(await runDispatchedToolScenario({
      name: 'parallel host tools with one tool error',
      count: 3,
      error: true,
      suspendDuringValidation: false,
    })),
    ...(await runDispatchedToolScenario({
      name: 'asynchronous input validation',
      count: 1,
      error: false,
      suspendDuringValidation: true,
    })),
    ...(await runApprovedContinuationScenario()),
  ];

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    console.error(REPRODUCTION_SIGNAL);
    process.exitCode = 1;
    return;
  }

  console.log(
    'Issue #20535 did not reproduce: every completed host result survived suspension and resumed exactly once.',
  );
}

main().catch(error => {
  console.error('REPRODUCTION HARNESS ERROR');
  console.error(error);
  process.exitCode = 2;
});
