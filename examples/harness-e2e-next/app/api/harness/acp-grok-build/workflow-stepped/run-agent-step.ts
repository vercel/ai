import {
  runSteppedHarnessAgent,
  type SteppedHarnessWorkflowState,
} from '@/util/stepped-harness-workflow';

export async function runGrokBuildACPStep(
  state: SteppedHarnessWorkflowState,
): Promise<SteppedHarnessWorkflowState> {
  'use step';

  const { grokBuildACPSteppedWorkflowAgent } =
    await import('@/agent/harness/acp-grok-build/basic-stepped-agent');
  return runSteppedHarnessAgent({
    agent: grokBuildACPSteppedWorkflowAgent,
    state,
  });
}
