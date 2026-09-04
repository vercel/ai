import {
  runHarnessAgentStep,
  type HarnessWorkflowState,
} from '@ai-sdk/workflow-harness';

export async function runGrokBuildACPStep(
  state: HarnessWorkflowState,
): Promise<HarnessWorkflowState> {
  'use step';

  const { grokBuildACPSteppedWorkflowAgent } =
    await import('@/agent/harness/acp-grok-build/basic-stepped-agent');
  return runHarnessAgentStep({
    agent: grokBuildACPSteppedWorkflowAgent,
    state,
  });
}
