import {
  runHarnessAgentStep,
  type HarnessWorkflowState,
} from '@ai-sdk/workflow-harness';

export async function runFxStep(
  state: HarnessWorkflowState,
): Promise<HarnessWorkflowState> {
  'use step';

  const { fxSteppedWorkflowAgent } =
    await import('@/agent/harness/fx/basic-stepped-agent');
  return runHarnessAgentStep({
    agent: fxSteppedWorkflowAgent,
    state,
  });
}
