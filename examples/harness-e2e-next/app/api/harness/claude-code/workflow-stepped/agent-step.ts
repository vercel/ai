import {
  runHarnessAgentStep,
  type HarnessWorkflowState,
} from '@ai-sdk/workflow-harness';

export async function agentStep(
  state: HarnessWorkflowState,
): Promise<HarnessWorkflowState> {
  'use step';

  const { claudeCodeSteppedWorkflowAgent } =
    await import('@/agent/harness/claude-code/basic-stepped-agent');
  return runHarnessAgentStep({
    agent: claudeCodeSteppedWorkflowAgent,
    state,
  });
}
