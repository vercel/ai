import {
  runSteppedHarnessAgent,
  type SteppedHarnessWorkflowState,
} from '@/util/stepped-harness-workflow';

export async function runCodexACPStep(
  state: SteppedHarnessWorkflowState,
): Promise<SteppedHarnessWorkflowState> {
  'use step';

  const { codexACPSteppedWorkflowAgent } =
    await import('@/agent/harness/acp-codex/basic-stepped-agent');
  return runSteppedHarnessAgent({
    agent: codexACPSteppedWorkflowAgent,
    state,
  });
}
