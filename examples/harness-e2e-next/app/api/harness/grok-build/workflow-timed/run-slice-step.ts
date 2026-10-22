import {
  runHarnessAgentTimeSlice,
  type HarnessWorkflowState,
} from '@ai-sdk/workflow-harness';

/*
 * The slice step lives in its own step-only module and the agent is imported
 * dynamically inside the step body. The Workflow DevKit stubs each `'use step'`
 * in the workflow bundle, so a dynamic import inside the body is dropped from
 * it — keeping the agent and its `@vercel/sandbox` deps (which use Node APIs)
 * out of the no-`require` workflow runtime. A static top-level import can't be:
 * importing the sandbox acquisition helper at module scope would pull its
 * Node-only dependencies into the workflow bundle.
 *
 * Demo budget: production defaults to 750s (just under Fluid Compute's ~800s
 * recycle); lowered here so a multi-step turn visibly freezes at the slice
 * boundary and the next step reattaches without a long wait.
 */
const DEMO_TIME_SLICE_SECONDS = 30;

export async function runGrokBuildSlice(
  state: HarnessWorkflowState,
): Promise<HarnessWorkflowState> {
  'use step';

  const { grokBuildHarnessAgent } =
    await import('@/agent/harness/grok-build/basic-agent');
  const { acquireHarnessSandboxSession } =
    await import('@/util/harness-sandbox-session');
  const sandboxSession = await acquireHarnessSandboxSession({
    agent: grokBuildHarnessAgent,
    sessionId: state.sessionId,
    ports: [4000],
    resumeFrom: state.resumeFrom,
    continueFrom: state.continueFrom,
  });
  return runHarnessAgentTimeSlice({
    agent: grokBuildHarnessAgent,
    state,
    sandboxSession,
    timeSliceSeconds: DEMO_TIME_SLICE_SECONDS,
  });
}
