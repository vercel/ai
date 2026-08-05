import {
  runHarnessAgentStep,
  type HarnessWorkflowState,
} from '@ai-sdk/workflow-harness';

export async function agentStep(
  state: HarnessWorkflowState,
): Promise<HarnessWorkflowState> {
  'use step';

  const { openCodeSteppedWorkflowAgent } =
    await import('@/agent/harness/opencode/basic-stepped-agent');
  return runHarnessAgentStep({
    agent: openCodeSteppedWorkflowAgent,
    state,
  });
}
