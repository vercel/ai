import {
  runHarnessAgentTimeSlice,
  type HarnessWorkflowState,
} from '@ai-sdk/workflow-harness';

/*
 * Slice step in its own step-only module; the agent is dynamically imported
 * inside the step body so it (and its `@vercel/sandbox` deps) stay out of the
 * workflow bundle's restricted runtime. See the claude-code slice step for the
 * full rationale.
 *
 * Demo budget lowered from the 750s production default so slicing is observable.
 */
const DEMO_TIME_SLICE_SECONDS = 30;

export async function timeSliceStep(
  state: HarnessWorkflowState,
): Promise<HarnessWorkflowState> {
  'use step';

  const { codexHarnessAgent } =
    await import('@/agent/harness/codex/basic-agent');
  return runHarnessAgentTimeSlice({
    agent: codexHarnessAgent,
    state,
    timeSliceSeconds: DEMO_TIME_SLICE_SECONDS,
  });
}
