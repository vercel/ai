import {
  runSteppedHarnessAgent,
  type SteppedHarnessWorkflowState,
} from '@/util/stepped-harness-workflow';

export async function runCodexStep(
  state: SteppedHarnessWorkflowState,
): Promise<SteppedHarnessWorkflowState> {
  'use step';

  const { codexSteppedWorkflowAgent } =
    await import('@/agent/harness/codex/basic-stepped-agent');
  return runSteppedHarnessAgent({
    agent: codexSteppedWorkflowAgent,
    state,
  });
}
