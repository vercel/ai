import {
  runHarnessAgentStep,
  type HarnessWorkflowState,
} from '@ai-sdk/workflow-harness';

export async function runGrokBuildStep(
  state: HarnessWorkflowState,
): Promise<HarnessWorkflowState> {
  'use step';

  const { grokBuildSteppedWorkflowAgent } =
    await import('@/agent/harness/grok-build/basic-stepped-agent');
  const { acquireHarnessSandboxSession } =
    await import('@/util/harness-sandbox-session');
  const sandboxSession = await acquireHarnessSandboxSession({
    agent: grokBuildSteppedWorkflowAgent,
    sessionId: state.sessionId,
    ports: [4000],
    resumeFrom: state.resumeFrom,
    continueFrom: state.continueFrom,
  });
  return runHarnessAgentStep({
    agent: grokBuildSteppedWorkflowAgent,
    state,
    sandboxSession,
  });
}
