import type { HarnessWorkflowState } from './harness-workflow-state';
import {
  runHarnessAgentTimeSlice,
  type RunHarnessAgentTimeSliceOptions,
} from './run-harness-agent-time-slice';

export interface RunHarnessAgentSliceOptions extends Omit<
  RunHarnessAgentTimeSliceOptions,
  'timeSliceSeconds'
> {
  readonly timeSliceSeconds?: number;
  /**
   * @deprecated Use `timeSliceSeconds` instead.
   */
  readonly sliceTimeoutSeconds?: number;
}

/**
 * @deprecated Use {@link runHarnessAgentTimeSlice} instead.
 */
export async function runHarnessAgentSlice(
  options: RunHarnessAgentSliceOptions,
): Promise<HarnessWorkflowState> {
  const { sliceTimeoutSeconds, timeSliceSeconds, ...timeSliceOptions } =
    options;
  const state = await runHarnessAgentTimeSlice({
    ...timeSliceOptions,
    timeSliceSeconds: timeSliceSeconds ?? sliceTimeoutSeconds,
  });

  return state.status === 'ready_for_next_step'
    ? { ...state, status: 'timed_out' }
    : state;
}
