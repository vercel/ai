import type { HarnessWorkflowState } from './harness-workflow-state';
import {
  runHarnessAgentTimeSlice,
  type RunHarnessAgentTimeSliceOptions,
} from './run-harness-agent-time-slice';

export interface RunHarnessAgentSliceOptions<OUTPUT = unknown> extends Omit<
  RunHarnessAgentTimeSliceOptions<OUTPUT>,
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
export async function runHarnessAgentSlice<OUTPUT = unknown>(
  options: RunHarnessAgentSliceOptions<OUTPUT>,
): Promise<HarnessWorkflowState<OUTPUT>> {
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
