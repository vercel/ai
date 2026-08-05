import {
  runSteppedHarnessAgent,
  type SteppedHarnessWorkflowState,
} from '@/util/stepped-harness-workflow';

export async function runClaudeCodeACPStep(
  state: SteppedHarnessWorkflowState,
): Promise<SteppedHarnessWorkflowState> {
  'use step';

  const { claudeCodeACPSteppedWorkflowAgent } =
    await import('@/agent/harness/acp-claude-code/basic-stepped-agent');
  return runSteppedHarnessAgent({
    agent: claudeCodeACPSteppedWorkflowAgent,
    state,
  });
}
