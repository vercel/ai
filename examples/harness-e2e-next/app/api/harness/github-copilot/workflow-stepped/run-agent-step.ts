import {
  runHarnessAgentStep,
  type HarnessWorkflowState,
} from '@ai-sdk/workflow-harness';

export async function runGitHubCopilotStep(
  state: HarnessWorkflowState,
): Promise<HarnessWorkflowState> {
  'use step';

  const { githubCopilotSteppedWorkflowAgent } =
    await import('@/agent/harness/github-copilot/basic-stepped-agent');
  const { acquireHarnessSandboxSession } =
    await import('@/util/harness-sandbox-session');
  const sandboxSession = await acquireHarnessSandboxSession({
    agent: githubCopilotSteppedWorkflowAgent,
    sessionId: state.sessionId,
    ports: [4000],
    resumeFrom: state.resumeFrom,
    continueFrom: state.continueFrom,
  });
  return runHarnessAgentStep({
    agent: githubCopilotSteppedWorkflowAgent,
    state,
    sandboxSession,
  });
}
