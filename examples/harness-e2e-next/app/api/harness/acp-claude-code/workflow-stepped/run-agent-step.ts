import {
  runHarnessAgentStep,
  type HarnessWorkflowState,
} from '@ai-sdk/workflow-harness';

export async function runClaudeCodeACPStep(
  state: HarnessWorkflowState,
): Promise<HarnessWorkflowState> {
  'use step';

  const { claudeCodeACPSteppedWorkflowAgent } =
    await import('@/agent/harness/acp-claude-code/basic-stepped-agent');
  return runHarnessAgentStep({
    agent: claudeCodeACPSteppedWorkflowAgent,
    state,
  });
}
