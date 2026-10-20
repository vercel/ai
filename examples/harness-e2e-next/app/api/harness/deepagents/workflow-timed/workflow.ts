import {
  loadResumeStep,
  persistResumeStep,
} from '@/util/workflow-resume-steps';
import {
  createHarnessWorkflowState,
  finalizeHarnessWorkflow,
  type HarnessWorkflowInput,
} from '@ai-sdk/workflow-harness';
import { timeSliceStep } from './time-slice-step';

// The `'use workflow'` function lives in its own `ai`-free module (not `route.ts`) so the DevKit's generated step/flow bundle doesn't pull in `@ai-sdk/gateway`/`@vercel/oidc` and crash. See the claude-code workflow module for the full rationale.
export async function timeSliceWorkflow(
  input: Pick<HarnessWorkflowInput, 'messages' | 'sessionId'>,
) {
  'use workflow';

  const resumeFrom = await loadResumeStep(input.sessionId);
  let state = createHarnessWorkflowState({ ...input, resumeFrom });
  do {
    state = await timeSliceStep(state);
  } while (state.status === 'ready_for_next_step');
  await persistResumeStep(state.sessionId, state.resumeFrom);
  return finalizeHarnessWorkflow(state);
}
