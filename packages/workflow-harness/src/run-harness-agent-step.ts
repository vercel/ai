import type { HarnessWorkflowState } from './harness-workflow-state';
import {
  runHarnessAgent,
  type RunHarnessAgentOptions,
} from './run-harness-agent';

export type RunHarnessAgentStepOptions<OUTPUT = unknown> = Omit<
  RunHarnessAgentOptions<OUTPUT>,
  'timeSliceSeconds'
>;

/**
 * Run a harness agent until its next semantic step boundary.
 *
 * Configure the agent with a `stopWhen` condition such as `isStepCount(1)`.
 * When that condition completes a result while the underlying turn remains
 * unfinished, the returned state has status `ready_for_next_step` and carries
 * the continuation state for the next workflow step.
 */
export async function runHarnessAgentStep<OUTPUT = unknown>(
  options: RunHarnessAgentStepOptions<OUTPUT>,
): Promise<HarnessWorkflowState<OUTPUT>> {
  return runHarnessAgent(options);
}
