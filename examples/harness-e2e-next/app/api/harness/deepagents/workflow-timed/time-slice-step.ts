import {
  runHarnessAgentTimeSlice,
  type HarnessWorkflowState,
} from '@ai-sdk/workflow-harness';

// Slice step in its own module; the agent is dynamically imported so its `@vercel/sandbox` deps stay out of the workflow bundle. See the claude-code slice step for the full rationale.

// Demo budget lowered from the 750s production default so slicing is observable.
const DEMO_TIME_SLICE_SECONDS = 30;

export async function timeSliceStep(
  state: HarnessWorkflowState,
): Promise<HarnessWorkflowState> {
  'use step';

  const { deepAgentsHarnessAgent } =
    await import('@/agent/harness/deepagents/basic-agent');
  return runHarnessAgentTimeSlice({
    agent: deepAgentsHarnessAgent,
    state,
    timeSliceSeconds: DEMO_TIME_SLICE_SECONDS,
  });
}
