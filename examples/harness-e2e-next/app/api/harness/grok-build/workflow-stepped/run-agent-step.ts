import {
  runHarnessAgentStep,
  type HarnessWorkflowState,
} from '@ai-sdk/workflow-harness';

export async function runGrokBuildStep(
  state: HarnessWorkflowState,
): Promise<HarnessWorkflowState> {
  'use step';

  const { grokBuildSteppedWorkflowAgent } =
    await import('@/agent/harness/grok-build/basic-stepped-agent');
  return runHarnessAgentStep({
    agent: grokBuildSteppedWorkflowAgent,
    state,
  });
}
