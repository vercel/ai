import {
  runHarnessAgentStep,
  type HarnessWorkflowState,
} from '@ai-sdk/workflow-harness';

export async function runCursorStep(
  state: HarnessWorkflowState,
): Promise<HarnessWorkflowState> {
  'use step';

  const { cursorSteppedWorkflowAgent } =
    await import('@/agent/harness/cursor/basic-stepped-agent');
  const { acquireHarnessSandboxSession } =
    await import('@/util/harness-sandbox-session');
  const sandboxSession = await acquireHarnessSandboxSession({
    agent: cursorSteppedWorkflowAgent,
    sessionId: state.sessionId,
    ports: [4000],
    resumeFrom: state.resumeFrom,
    continueFrom: state.continueFrom,
  });
  return runHarnessAgentStep({
    agent: cursorSteppedWorkflowAgent,
    state,
    sandboxSession,
  });
}
