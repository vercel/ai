import type { HarnessWorkflowState } from './harness-workflow-state';
import {
  runHarnessAgent,
  type RunHarnessAgentOptions,
} from './run-harness-agent';

/*
 * Vercel Fluid Compute recycles a function instance at approximately 800
 * seconds. Completing a time slice at 750 seconds leaves a safety buffer so
 * the next invocation can reattach to the still-running sandbox.
 */
const DEFAULT_TIME_SLICE_SECONDS = 750;

export interface RunHarnessAgentTimeSliceOptions extends Omit<
  RunHarnessAgentOptions,
  'timeSliceSeconds'
> {
  /**
   * Wall-clock budget for one time slice. Defaults to 750 seconds.
   */
  readonly timeSliceSeconds?: number;
}

/**
 * Run one time-boxed slice of a durable harness agent turn.
 *
 * When the time slice completes before the turn, the returned state has status
 * `ready_for_next_step` and carries the continuation state for the next slice.
 */
export async function runHarnessAgentTimeSlice(
  options: RunHarnessAgentTimeSliceOptions,
): Promise<HarnessWorkflowState> {
  return runHarnessAgent({
    ...options,
    timeSliceSeconds: options.timeSliceSeconds ?? DEFAULT_TIME_SLICE_SECONDS,
  });
}
