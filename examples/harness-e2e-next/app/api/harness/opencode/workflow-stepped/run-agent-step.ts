import {
  runSteppedHarnessAgent,
  type SteppedHarnessWorkflowState,
} from '@/util/stepped-harness-workflow';

export async function runOpenCodeStep(
  state: SteppedHarnessWorkflowState,
): Promise<SteppedHarnessWorkflowState> {
  'use step';

  const { openCodeSteppedWorkflowAgent } =
    await import('@/agent/harness/opencode/basic-stepped-agent');
  return runSteppedHarnessAgent({
    agent: openCodeSteppedWorkflowAgent,
    state,
  });
}
