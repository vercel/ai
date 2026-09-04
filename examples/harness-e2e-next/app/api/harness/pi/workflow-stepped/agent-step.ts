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
  return runHarnessAgentStep({
    agent: piSteppedWorkflowAgent,
    state,
  });
}
