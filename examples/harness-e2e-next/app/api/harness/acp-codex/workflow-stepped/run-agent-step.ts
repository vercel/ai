import {
  runHarnessAgentStep,
  type HarnessWorkflowState,
} from '@ai-sdk/workflow-harness';

export async function runCodexACPStep(
  state: HarnessWorkflowState,
): Promise<HarnessWorkflowState> {
  'use step';

  const { codexACPSteppedWorkflowAgent } =
    await import('@/agent/harness/acp-codex/basic-stepped-agent');
  return runHarnessAgentStep({
    agent: codexACPSteppedWorkflowAgent,
    state,
  });
}
