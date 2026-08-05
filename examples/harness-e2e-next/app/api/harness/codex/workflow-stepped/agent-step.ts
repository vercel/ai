import {
  runHarnessAgentStep,
  type HarnessWorkflowState,
} from '@ai-sdk/workflow-harness';

export async function agentStep(
  state: HarnessWorkflowState,
): Promise<HarnessWorkflowState> {
  'use step';

  const { codexSteppedWorkflowAgent } =
    await import('@/agent/harness/codex/basic-stepped-agent');
  return runHarnessAgentStep({
    agent: codexSteppedWorkflowAgent,
    state,
  });
}
