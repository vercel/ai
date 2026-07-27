import {
  runSteppedHarnessAgent,
  type SteppedHarnessWorkflowState,
} from '@/util/stepped-harness-workflow';

export async function runPiStep(
  state: SteppedHarnessWorkflowState,
): Promise<SteppedHarnessWorkflowState> {
  'use step';

  const { piSteppedWorkflowAgent } =
    await import('@/agent/harness/pi/basic-stepped-agent');
  return runSteppedHarnessAgent({
    agent: piSteppedWorkflowAgent,
    state,
  });
}
