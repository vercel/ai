import {
  runSteppedHarnessAgent,
  type SteppedHarnessWorkflowState,
} from '@/util/stepped-harness-workflow';

export async function runClaudeCodeStep(
  state: SteppedHarnessWorkflowState,
): Promise<SteppedHarnessWorkflowState> {
  'use step';

  const { claudeCodeSteppedWorkflowAgent } =
    await import('@/agent/harness/claude-code/basic-stepped-agent');
  return runSteppedHarnessAgent({
    agent: claudeCodeSteppedWorkflowAgent,
    state,
  });
}
