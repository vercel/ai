import {
  runHarnessAgentStep,
  type HarnessWorkflowState,
} from '@ai-sdk/workflow-harness';

export async function agentStep(
  state: HarnessWorkflowState,
): Promise<HarnessWorkflowState> {
  'use step';

  const { clineSteppedWorkflowAgent } =
    await import('@/agent/harness/cline/basic-stepped-agent');
  return runHarnessAgentStep({
    agent: clineSteppedWorkflowAgent,
    state,
  });
}
