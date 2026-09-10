import type {
  HarnessV1,
  HarnessV1NetworkSandboxSession,
  HarnessV1PromptTurnOptions,
  HarnessV1ResumeSessionState,
  HarnessV1SandboxProvider,
  HarnessV1Session,
  HarnessV1StreamPart,
} from '@ai-sdk/harness';
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createJustBashSandbox } from '@ai-sdk/sandbox-just-bash';
import type {
  HarnessWorkflowChunk,
  HarnessWorkflowState,
} from '../../../../packages/workflow-harness/dist/index.js';
import type * as WorkflowHarness from '../../../../packages/workflow-harness/dist/index.js';

const workflowHarnessSource = [
  '../../../..',
  'packages/workflow-harness/src/index.ts',
].join('/');
const { createHarnessWorkflowState, runHarnessAgentStep } = (await import(
  workflowHarnessSource
)) as typeof WorkflowHarness;

const failureSignal =
  'ISSUE 20614 REPRODUCED: destroyOnFinish=false destroyed failed sessions instead of preserving resumability';

type TurnBehavior = 'success' | 'provider-error';

type LifecycleCounts = {
  adapterDetach: number;
  adapterDestroy: number;
  sandboxDestroy: number;
};

type CaseResult = {
  name: string;
  state: HarnessWorkflowState;
  counts: LifecycleCounts;
};

function resumeState(checkpoint: string): HarnessV1ResumeSessionState {
  return {
    type: 'resume-session',
    harnessId: 'issue-20614',
    specificationVersion: 'harness-v1',
    data: { checkpoint },
  };
}

function zeroUsage() {
  return {
    inputTokens: {
      total: 0,
      noCache: 0,
      cacheRead: 0,
      cacheWrite: 0,
    },
    outputTokens: {
      total: 0,
      text: 0,
      reasoning: 0,
    },
  };
}

function successEvents(): HarnessV1StreamPart[] {
  return [
    { type: 'stream-start', modelId: 'fixture-model' },
    { type: 'text-start', id: 'text-1' },
    { type: 'text-delta', id: 'text-1', delta: 'ok' },
    { type: 'text-end', id: 'text-1' },
    {
      type: 'finish-step',
      finishReason: { unified: 'stop', raw: 'stop' },
      usage: zeroUsage(),
    },
    {
      type: 'finish',
      finishReason: { unified: 'stop', raw: 'stop' },
      totalUsage: zeroUsage(),
    },
  ];
}

function createAdapter(options: {
  behavior: TurnBehavior | ((startCount: number) => TurnBehavior);
  counts: LifecycleCounts;
}): HarnessV1 {
  let startCount = 0;

  return {
    specificationVersion: 'harness-v1',
    harnessId: 'issue-20614',
    builtinTools: {},
    async doStart(startOptions) {
      startCount++;
      const checkpoint = `native-${startCount}`;
      const behavior =
        typeof options.behavior === 'function'
          ? options.behavior(startCount)
          : options.behavior;

      const session: HarnessV1Session = {
        sessionId: startOptions.sessionId,
        isResume:
          startOptions.resumeFrom != null || startOptions.continueFrom != null,
        async doPromptTurn(turnOptions: HarnessV1PromptTurnOptions) {
          const events: HarnessV1StreamPart[] =
            behavior === 'success'
              ? successEvents()
              : [
                  { type: 'stream-start', modelId: 'fixture-model' },
                  {
                    type: 'error',
                    error: new Error('Provider unavailable'),
                  },
                ];

          queueMicrotask(() => {
            for (const event of events) {
              turnOptions.emit(event);
            }
          });

          return {
            submitToolResult: async () => {},
            done: Promise.resolve(),
          };
        },
        async doContinueTurn() {
          throw new Error('continuation is not used by this reproduction');
        },
        async doSuspendTurn() {
          throw new Error('suspension is not used by this reproduction');
        },
        async doDetach() {
          options.counts.adapterDetach++;
          return resumeState(checkpoint);
        },
        async doStop() {
          return resumeState(checkpoint);
        },
        async doDestroy() {
          options.counts.adapterDestroy++;
        },
        async doCompact() {},
      };

      return session;
    },
  };
}

function createTrackedJustBashProvider(
  counts: LifecycleCounts,
): HarnessV1SandboxProvider {
  const delegate = createJustBashSandbox();
  const sessions = new Map<string, HarnessV1NetworkSandboxSession>();

  const track = (
    session: HarnessV1NetworkSandboxSession,
  ): HarnessV1NetworkSandboxSession =>
    new Proxy(session, {
      get(target, property, receiver) {
        if (property === 'destroy') {
          return async () => {
            counts.sandboxDestroy++;
            await target.destroy();
          };
        }
        return Reflect.get(target, property, receiver);
      },
    });

  return {
    specificationVersion: 'harness-sandbox-v1',
    providerId: 'tracked-just-bash',
    async createSession(options) {
      const session = track(await delegate.createSession(options));
      if (options?.sessionId != null) {
        sessions.set(options.sessionId, session);
      }
      return session;
    },
    async resumeSession({ sessionId }) {
      const session = sessions.get(sessionId);
      if (session == null) {
        throw new Error(`missing in-process sandbox ${sessionId}`);
      }
      return session;
    },
  };
}

function writable(): WritableStream<HarnessWorkflowChunk> {
  return new WritableStream<HarnessWorkflowChunk>();
}

async function runCase(options: {
  name: string;
  behavior: TurnBehavior;
  prepareCallThrows?: boolean;
  resumeFrom?: HarnessV1ResumeSessionState;
}): Promise<CaseResult> {
  const counts: LifecycleCounts = {
    adapterDetach: 0,
    adapterDestroy: 0,
    sandboxDestroy: 0,
  };
  const agent = new HarnessAgent({
    harness: createAdapter({ behavior: options.behavior, counts }),
    sandbox: createTrackedJustBashProvider(counts),
    ...(options.prepareCallThrows
      ? {
          prepareCall: () => {
            throw new Error('Configuration unavailable');
          },
        }
      : {}),
  });

  const state = await runHarnessAgentStep({
    agent,
    state: createHarnessWorkflowState({
      prompt: 'hello',
      sessionId: options.name,
      ...(options.resumeFrom == null ? {} : { resumeFrom: options.resumeFrom }),
    }),
    writable: writable(),
    destroyOnFinish: false,
  });

  return { name: options.name, state, counts };
}

async function runResumedFailureCase(): Promise<CaseResult> {
  const counts: LifecycleCounts = {
    adapterDetach: 0,
    adapterDestroy: 0,
    sandboxDestroy: 0,
  };
  const agent = new HarnessAgent({
    harness: createAdapter({
      behavior: startCount => (startCount === 1 ? 'success' : 'provider-error'),
      counts,
    }),
    sandbox: createTrackedJustBashProvider(counts),
  });

  const firstTurn = await runHarnessAgentStep({
    agent,
    state: createHarnessWorkflowState({
      prompt: 'first turn',
      sessionId: 'resumed-provider-error',
    }),
    writable: writable(),
    destroyOnFinish: false,
  });

  if (
    firstTurn.status !== 'finished' ||
    checkpoint(firstTurn.resumeFrom) !== 'native-1'
  ) {
    throw new Error(
      `reproduction setup failed: could not create first-turn resume state: ${JSON.stringify(firstTurn)}`,
    );
  }

  const state = await runHarnessAgentStep({
    agent,
    state: createHarnessWorkflowState({
      prompt: 'second turn',
      sessionId: 'resumed-provider-error',
      resumeFrom: firstTurn.resumeFrom,
    }),
    writable: writable(),
    destroyOnFinish: false,
  });

  return { name: 'resumed-provider-error', state, counts };
}

function checkpoint(
  state: HarnessV1ResumeSessionState | undefined,
): string | undefined {
  const data = state?.data;
  if (
    data != null &&
    typeof data === 'object' &&
    !Array.isArray(data) &&
    typeof data.checkpoint === 'string'
  ) {
    return data.checkpoint;
  }
  return undefined;
}

function assertSetup(results: CaseResult[]): void {
  const [success, providerError, prepareCallError, resumedProviderError] =
    results;

  if (
    success?.state.status !== 'finished' ||
    checkpoint(success.state.resumeFrom) !== 'native-1' ||
    success.counts.adapterDetach !== 1 ||
    success.counts.adapterDestroy !== 0 ||
    success.counts.sandboxDestroy !== 0
  ) {
    throw new Error(
      `reproduction setup failed: successful turn did not preserve its session: ${JSON.stringify(success)}`,
    );
  }

  if (
    providerError?.state.status !== 'failed' ||
    providerError.state.error !== 'harness turn emitted an error'
  ) {
    throw new Error(
      `reproduction setup failed: provider error did not produce a failed workflow state: ${JSON.stringify(providerError)}`,
    );
  }

  if (
    prepareCallError?.state.status !== 'failed' ||
    prepareCallError.state.error !== 'Configuration unavailable'
  ) {
    throw new Error(
      `reproduction setup failed: prepareCall rejection did not produce a failed workflow state: ${JSON.stringify(prepareCallError)}`,
    );
  }

  if (
    resumedProviderError?.state.status !== 'failed' ||
    resumedProviderError.state.error !== 'harness turn emitted an error'
  ) {
    throw new Error(
      `reproduction setup failed: resumed provider error did not produce a failed workflow state: ${JSON.stringify(resumedProviderError)}`,
    );
  }
}

async function main(): Promise<void> {
  const results = [
    ...(await Promise.all([
      runCase({ name: 'success', behavior: 'success' }),
      runCase({ name: 'provider-error', behavior: 'provider-error' }),
      runCase({
        name: 'prepare-call-error',
        behavior: 'success',
        prepareCallThrows: true,
      }),
    ])),
    await runResumedFailureCase(),
  ];

  assertSetup(results);

  const [, providerError, prepareCallError, resumedProviderError] = results;
  const failures = [
    providerError,
    prepareCallError,
    resumedProviderError,
  ].filter(result => {
    const expectedDetachCount =
      result.name === 'resumed-provider-error' ? 2 : 1;
    const expectedCheckpoint =
      result.name === 'resumed-provider-error' ? 'native-2' : 'native-1';
    return (
      result.counts.adapterDestroy !== 0 ||
      result.counts.sandboxDestroy !== 0 ||
      result.counts.adapterDetach !== expectedDetachCount ||
      checkpoint(result.state.resumeFrom) !== expectedCheckpoint
    );
  });

  if (failures.length > 0) {
    throw new Error(`${failureSignal}\n${JSON.stringify(failures, null, 2)}`);
  }

  console.log('Issue 20614 is not reproduced.');
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
