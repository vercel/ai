import {
  runHarnessAgentStep,
  type HarnessWorkflowState,
} from '@ai-sdk/workflow-harness';

export async function agentStep(
  state: HarnessWorkflowState,
): Promise<HarnessWorkflowState> {
  'use step';

  const { deepAgentsSteppedWorkflowAgent } =
    await import('@/agent/harness/deepagents/basic-stepped-agent');
  return runHarnessAgentStep({
    agent: deepAgentsSteppedWorkflowAgent,
    state,
  });
}
