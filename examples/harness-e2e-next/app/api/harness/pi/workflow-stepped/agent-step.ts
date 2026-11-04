import {
  runHarnessAgentStep,
  type HarnessWorkflowState,
} from '@ai-sdk/workflow-harness';

export async function agentStep(
  state: HarnessWorkflowState,
): Promise<HarnessWorkflowState> {
  'use step';

  const { piSteppedWorkflowAgent } =
    await import('@/agent/harness/pi/basic-stepped-agent');
  const { acquireHarnessSandboxSession } =
    await import('@/util/harness-sandbox-session');
  const sandboxSession = await acquireHarnessSandboxSession({
    agent: piSteppedWorkflowAgent,
    sessionId: state.sessionId,
    resumeFrom: state.resumeFrom,
    continueFrom: state.continueFrom,
  });
  return runHarnessAgentStep({
    agent: piSteppedWorkflowAgent,
    state,
    sandboxSession,
  });
}
