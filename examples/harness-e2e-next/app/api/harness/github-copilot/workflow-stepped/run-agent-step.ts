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
  return runHarnessAgentStep({
    agent: githubCopilotSteppedWorkflowAgent,
    state,
  });
}
