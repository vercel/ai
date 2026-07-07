import {
  HarnessAgent,
  type HarnessAgentAdapter,
  type HarnessAgentAdapterSession,
  type HarnessAgentPromptControl,
  type HarnessAgentPromptTurnOptions,
  type HarnessAgentStreamPart,
} from '@ai-sdk/harness/agent';
import type {
  HarnessV1NetworkSandboxSession,
  HarnessV1SandboxProvider,
} from '@ai-sdk/harness';
import type { Telemetry } from 'ai';

const usage = {
  inputTokens: {
    total: 1,
    noCache: 1,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

function scriptedHarness(
  script: HarnessAgentStreamPart[],
): HarnessAgentAdapter {
  const session: HarnessAgentAdapterSession = {
    sessionId: 'issue-16719-session',
    isResume: false,
    doPromptTurn: async (opts: HarnessAgentPromptTurnOptions) => {
      const control: HarnessAgentPromptControl = {
        submitToolResult: async () => {},
        done: Promise.resolve(),
      };
      queueMicrotask(() => {
        for (const event of script) opts.emit(event);
      });
      return control;
    },
    doCompact: async () => {},
    doContinueTurn: async () => ({
      submitToolResult: async () => {},
      done: Promise.resolve(),
    }),
    doDetach: async () => ({
      type: 'resume-session',
      harnessId: 'mock',
      specificationVersion: 'harness-v1',
      data: {},
    }),
    doStop: async () => ({
      type: 'resume-session',
      harnessId: 'mock',
      specificationVersion: 'harness-v1',
      data: {},
    }),
    doDestroy: async () => {},
    doSuspendTurn: async () => ({
      type: 'continue-turn',
      harnessId: 'mock',
      specificationVersion: 'harness-v1',
      data: {},
    }),
  };

  return {
    specificationVersion: 'harness-v1',
    harnessId: 'mock',
    builtinTools: {},
    doStart: async () => session,
  };
}

function makeSandboxProvider(): HarnessV1SandboxProvider {
  const sandboxSession = {
    id: 'sandbox',
    defaultWorkingDirectory: '/work',
    ports: [],
    getPortUrl: async () => 'ws://example.test/',
    run: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
    stop: async () => {},
    destroy: async () => {},
    restricted: () => ({}),
  } as unknown as HarnessV1NetworkSandboxSession;

  return {
    specificationVersion: 'harness-sandbox-v1',
    providerId: 'mock-sandbox',
    createSession: async () => sandboxSession,
  };
}

async function main(): Promise<void> {
  const stepStartNumbers: number[] = [];
  const stepEndNumbers: number[] = [];
  const integration = {
    onStepStart: event => {
      stepStartNumbers.push(event.stepNumber);
    },
    onStepEnd: event => {
      stepEndNumbers.push(event.stepNumber);
    },
  } satisfies Telemetry;

  const agent = new HarnessAgent({
    harness: scriptedHarness([
      { type: 'stream-start' },
      { type: 'text-start', id: 't1' },
      { type: 'text-delta', id: 't1', delta: 'done' },
      { type: 'text-end', id: 't1' },
      {
        type: 'finish-step',
        finishReason: { unified: 'stop', raw: 'stop' },
        usage,
      },
      {
        type: 'finish',
        finishReason: { unified: 'stop', raw: 'stop' },
        totalUsage: usage,
      },
    ]),
    sandbox: makeSandboxProvider(),
    telemetry: { integrations: [integration] },
  });

  const session = await agent.createSession();
  try {
    await agent.generate({ session, prompt: 'go' });
  } finally {
    await session.destroy();
  }

  console.log('onStepStart stepNumber values:', stepStartNumbers);
  console.log('onStepEnd stepNumber values:', stepEndNumbers);

  if (stepEndNumbers.some(stepNumber => stepNumber == null)) {
    throw new Error(
      'Reproduced issue #16719: onStepEnd is missing stepNumber.',
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
