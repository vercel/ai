import assert from 'node:assert/strict';

type HarnessWorkflowChunk = {
  type: string;
  [key: string]: unknown;
};

async function main() {
  const workflowHarnessModule = new URL(
    '../../../../packages/workflow-harness/src/index.ts',
    import.meta.url,
  ).href;
  const { createHarnessWorkflowState, runHarnessAgentTimeSlice } = await import(
    workflowHarnessModule
  );

  let unfinishedTurn = true;
  let suspendCalls = 0;
  let detachCalls = 0;
  let outputClosed = false;
  let resolveStreamClosed!: () => void;
  const streamClosed = new Promise<void>(resolve => {
    resolveStreamClosed = resolve;
  });

  const session = {
    sessionId: 'ses_19419',
    hasUnfinishedTurn() {
      return unfinishedTurn;
    },
    async suspendTurn() {
      suspendCalls++;
      await streamClosed;
      await new Promise(resolve => setTimeout(resolve, 0));
      throw new Error(
        'Harness session ses_19419 has no unfinished turn to suspend.',
      );
    },
    async detach() {
      detachCalls++;
      return {
        type: 'resume-session' as const,
        harnessId: 'mock',
        specificationVersion: 'harness-v1' as const,
        data: {},
      };
    },
    async destroy() {},
  };

  const result = {
    toUIMessageStream() {
      return new ReadableStream<HarnessWorkflowChunk>({
        start(controller) {
          controller.enqueue({ type: 'start' });
          controller.enqueue({
            type: 'text-delta',
            id: 'text-1',
            delta: 'completed',
          });

          setTimeout(() => {
            // Mirrors onTurnFinished(): the turn is complete before the
            // time-slice deadline, but the UI stream is still open.
            unfinishedTurn = false;
          }, 20);

          setTimeout(() => {
            controller.close();
            resolveStreamClosed();
          }, 200);
        },
      });
    },
    finishReason: Promise.resolve('stop'),
    totalUsage: Promise.resolve({
      inputTokens: { total: 1 },
      outputTokens: { total: 1 },
    }),
  };

  const agent = {
    async createSession() {
      return session;
    },
    async stream() {
      return result;
    },
    async continueStream() {
      return result;
    },
  };

  const writable = new WritableStream<HarnessWorkflowChunk>({
    close() {
      outputClosed = true;
    },
  });

  const next = await runHarnessAgentTimeSlice({
    agent,
    state: createHarnessWorkflowState({
      prompt: 'finish just before the deadline',
      sessionId: session.sessionId,
    }),
    timeSliceSeconds: 0.1,
    writable,
  });

  assert.equal(
    next.status,
    'finished',
    'a turn completed before the deadline must finish normally',
  );
  assert.equal(outputClosed, true, 'the finished output stream must close');
  assert.equal(detachCalls, 1, 'normal session detach cleanup must run');
  assert.equal(
    suspendCalls,
    0,
    'the timer must not suspend an already completed turn',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
