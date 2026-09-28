import type {
  HarnessV1ContinueTurnState,
  HarnessV1ResumeSessionState,
} from '@ai-sdk/harness';
import type { HarnessAgentSession } from '@ai-sdk/harness/agent';
import {
  runHarnessAgentStep,
  type HarnessWorkflowAgent,
  type HarnessWorkflowChunk,
  type HarnessWorkflowStreamResult,
} from '@ai-sdk/workflow-harness';
import assert from 'node:assert/strict';

const staleResumeState: HarnessV1ResumeSessionState = {
  type: 'resume-session',
  harnessId: 'issue-21587',
  specificationVersion: 'harness-v1',
  data: { cursor: 'before-finished-turn' },
};

function completedStreamResult(): HarnessWorkflowStreamResult {
  return {
    toUIMessageStream() {
      return new ReadableStream<HarnessWorkflowChunk>({
        start(controller) {
          controller.enqueue({ type: 'start' });
          controller.enqueue({ type: 'text-start', id: 'text-1' });
          controller.enqueue({
            type: 'text-delta',
            id: 'text-1',
            delta: 'finished',
          });
          controller.enqueue({ type: 'text-end', id: 'text-1' });
          controller.close();
        },
      });
    },
    finishReason: Promise.resolve('stop'),
    totalUsage: Promise.resolve({
      inputTokens: 1,
      outputTokens: 1,
    }),
  };
}

async function main() {
  let detachCalls = 0;
  const session = {
    sessionId: 'session-21587',
    hasUnfinishedTurn: () => false,
    suspendTurn: async (): Promise<HarnessV1ContinueTurnState> => {
      throw new Error('suspendTurn should not be called for a finished turn');
    },
    detach: async (): Promise<HarnessV1ResumeSessionState> => {
      detachCalls++;
      throw new Error('could not persist finished-turn resume state');
    },
    stop: async (): Promise<HarnessV1ResumeSessionState> => {
      throw new Error('stop should remain available after detach failure');
    },
    destroy: async () => {},
  } as unknown as HarnessAgentSession;

  const agent: HarnessWorkflowAgent = {
    createSession: async () => session,
    stream: async () => completedStreamResult(),
    continueStream: async () => {
      throw new Error('continueStream should not be called on a new turn');
    },
  };

  const outputChunks: HarnessWorkflowChunk[] = [];
  const writable = new WritableStream<HarnessWorkflowChunk>({
    write(chunk) {
      outputChunks.push(chunk);
    },
  });

  try {
    const next = await runHarnessAgentStep({
      agent,
      state: {
        sessionId: 'session-21587',
        prompt: 'Finish this turn.',
        status: 'not_started',
        resumeFrom: staleResumeState,
      },
      writable,
    });
    assert.equal(next.status, 'finished');
    assert.deepEqual(next.resumeFrom, staleResumeState);
  } catch (error) {
    assert.match(
      error instanceof Error ? error.message : String(error),
      /could not persist finished-turn resume state/,
    );
    assert.equal(detachCalls, 1);
    console.log('Issue #21587 detach failure was surfaced as expected.');
    return;
  }

  assert.equal(detachCalls, 1);
  assert.equal(outputChunks.at(-1)?.type, 'finish');
  console.error(
    'ISSUE_21587: finished workflow suppressed detach failure and returned stale resume state',
  );
  process.exitCode = 1;
}

main().catch(error => {
  console.error('REPRODUCTION_HARNESS_ERROR', error);
  process.exitCode = 2;
});
