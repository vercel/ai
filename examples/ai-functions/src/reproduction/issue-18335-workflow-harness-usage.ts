import type { HarnessAgentSession } from '@ai-sdk/harness/agent';
import {
  createHarnessWorkflowState,
  runHarnessAgentTimeSlice,
  type HarnessWorkflowAgent,
  type HarnessWorkflowChunk,
  type HarnessWorkflowStreamResult,
} from '../../../../packages/workflow-harness/dist/index.js';

const SESSION_ID = 'issue-18335-session';
const FAILURE_SIGNAL =
  'ISSUE_18335_REPRODUCED: completed HarnessAgent workflow dropped flat totalUsage; finalResult.usage was undefined';

function continueState(tag: string) {
  return {
    type: 'continue-turn' as const,
    harnessId: 'mock',
    specificationVersion: 'harness-v1' as const,
    data: { tag },
  };
}

function resumeState(tag: string) {
  return {
    type: 'resume-session' as const,
    harnessId: 'mock',
    specificationVersion: 'harness-v1' as const,
    data: { tag },
  };
}

function createSession(options?: {
  onSuspend?: () => void;
}): HarnessAgentSession {
  return {
    sessionId: SESSION_ID,
    hasUnfinishedTurn: () => false,
    suspendTurn: async () => {
      options?.onSuspend?.();
      return continueState('time-slice-cursor');
    },
    detach: async () => resumeState('finished'),
    stop: async () => resumeState('stopped'),
    destroy: async () => {},
  } as unknown as HarnessAgentSession;
}

function createBlockingStreamResult(): {
  result: HarnessWorkflowStreamResult;
  close: () => void;
} {
  let close = () => {};
  let keepAlive: ReturnType<typeof setTimeout> | undefined;
  const result: HarnessWorkflowStreamResult = {
    toUIMessageStream() {
      return new ReadableStream<HarnessWorkflowChunk>({
        start(controller) {
          controller.enqueue({ type: 'start' });
          controller.enqueue({ type: 'text-start', id: 'text-1' });
          controller.enqueue({
            type: 'text-delta',
            id: 'text-1',
            delta: 'first slice',
          });
          keepAlive = setTimeout(() => {}, 1_000);
          close = () => {
            if (keepAlive != null) clearTimeout(keepAlive);
            controller.close();
          };
        },
      });
    },
    finishReason: Promise.resolve('stop'),
    totalUsage: Promise.resolve({
      inputTokens: 40,
      outputTokens: 10,
    }),
  };
  return { result, close: () => close() };
}

function createCompletedStreamResult(): HarnessWorkflowStreamResult {
  return {
    toUIMessageStream() {
      return new ReadableStream<HarnessWorkflowChunk>({
        start(controller) {
          controller.enqueue({ type: 'start' });
          controller.enqueue({
            type: 'text-delta',
            id: 'text-1',
            delta: ' second slice',
          });
          controller.enqueue({ type: 'text-end', id: 'text-1' });
          controller.close();
        },
      });
    },
    finishReason: Promise.resolve('stop'),
    totalUsage: Promise.resolve({
      inputTokens: 120,
      inputTokenDetails: {
        noCacheTokens: 120,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
      outputTokens: 30,
      outputTokenDetails: {
        textTokens: 30,
        reasoningTokens: 0,
      },
      totalTokens: 150,
    }),
  };
}

function createWritable(): WritableStream<HarnessWorkflowChunk> {
  return new WritableStream<HarnessWorkflowChunk>();
}

async function main() {
  const firstStream = createBlockingStreamResult();
  let sessionCount = 0;
  const agent: HarnessWorkflowAgent = {
    async createSession() {
      sessionCount += 1;
      return createSession({
        onSuspend: sessionCount === 1 ? firstStream.close : undefined,
      });
    },
    async stream() {
      return firstStream.result;
    },
    async continueStream() {
      return createCompletedStreamResult();
    },
  };

  const firstSlice = await runHarnessAgentTimeSlice({
    agent,
    state: createHarnessWorkflowState({
      prompt: 'Complete a task across two time slices.',
      sessionId: SESSION_ID,
    }),
    timeSliceSeconds: 0.01,
    writable: createWritable(),
  });

  if (firstSlice.status !== 'ready_for_next_step') {
    throw new Error(
      `Reproduction setup failed: first slice status was ${firstSlice.status}`,
    );
  }

  const completed = await runHarnessAgentTimeSlice({
    agent,
    state: firstSlice,
    writable: createWritable(),
  });

  if (
    completed.status !== 'finished' ||
    completed.finalResult?.sessionId !== SESSION_ID ||
    completed.finalResult.finishReason !== 'stop'
  ) {
    throw new Error(
      `Reproduction setup failed: workflow did not complete normally: ${JSON.stringify(completed)}`,
    );
  }

  const expectedUsage = { inputTokens: 120, outputTokens: 30 };
  if (completed.finalResult.usage == null) {
    throw new Error(FAILURE_SIGNAL);
  }

  if (
    completed.finalResult.usage.inputTokens !== expectedUsage.inputTokens ||
    completed.finalResult.usage.outputTokens !== expectedUsage.outputTokens
  ) {
    throw new Error(
      `ISSUE_18335_REPRODUCED: expected ${JSON.stringify(expectedUsage)} but received ${JSON.stringify(completed.finalResult.usage)}`,
    );
  }

  console.log(
    'Issue #18335 did not reproduce: finalResult.usage retained the flat token counts.',
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
