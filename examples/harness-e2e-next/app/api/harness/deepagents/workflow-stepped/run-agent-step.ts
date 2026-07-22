import {
  runSteppedHarnessAgent,
  type SteppedHarnessWorkflowState,
} from '@/util/stepped-harness-workflow';

export async function runDeepAgentsStep(
  state: SteppedHarnessWorkflowState,
): Promise<SteppedHarnessWorkflowState> {
  'use step';

  const { deepAgentsSteppedWorkflowAgent } =
    await import('@/agent/harness/deepagents/basic-stepped-agent');
  return runSteppedHarnessAgent({
    agent: deepAgentsSteppedWorkflowAgent,
    state,
  });
}
