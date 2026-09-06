import {
  runHarnessAgentTimeSlice,
  type HarnessWorkflowState,
} from '@ai-sdk/workflow-harness';

/*
 * Slice step in its own step-only module; the agent is dynamically imported
 * inside the step body so it stays out of the workflow bundle's restricted
 * runtime. See the claude-code slice step for the full rationale.
 *
 * Pi runs the model on the host (no bridge), so its continuation is
 * rerun-from-journal rather than a lossless attach. Demo budget lowered from
 * the 750s production default so slicing is observable.
 */
const DEMO_TIME_SLICE_SECONDS = 30;

export async function timeSliceStep(
  state: HarnessWorkflowState,
): Promise<HarnessWorkflowState> {
  'use step';

  const { piHarnessAgent } = await import('@/agent/harness/pi/basic-agent');
  return runHarnessAgentTimeSlice({
    agent: piHarnessAgent,
    state,
    timeSliceSeconds: DEMO_TIME_SLICE_SECONDS,
  });
}
