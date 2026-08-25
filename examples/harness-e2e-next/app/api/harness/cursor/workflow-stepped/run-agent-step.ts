import {
  runHarnessAgentStep,
  type HarnessWorkflowState,
} from '@ai-sdk/workflow-harness';

export async function runCursorStep(
  state: HarnessWorkflowState,
): Promise<HarnessWorkflowState> {
  'use step';

  const { cursorSteppedWorkflowAgent } =
    await import('@/agent/harness/cursor/basic-stepped-agent');
  return runHarnessAgentStep({
    agent: cursorSteppedWorkflowAgent,
    state,
  });
}
