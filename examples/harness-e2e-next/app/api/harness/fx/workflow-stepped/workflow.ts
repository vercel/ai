import {
  createHarnessWorkflowState,
  finalizeHarnessWorkflow,
  type HarnessWorkflowInput,
} from '@ai-sdk/workflow-harness';
import {
  loadResumeStep,
  persistResumeStep,
} from '@/util/workflow-resume-steps';
import { runFxStep } from './run-agent-step';

export async function fxSteppedWorkflow(
  input: Pick<HarnessWorkflowInput, 'messages' | 'sessionId'>,
) {
  'use workflow';

  const resumeFrom = await loadResumeStep(input.sessionId);
  let state = createHarnessWorkflowState({ ...input, resumeFrom });
  do {
    state = await runFxStep(state);
  } while (state.status === 'ready_for_next_step');
  await persistResumeStep(state.sessionId, state.resumeFrom);
  return finalizeHarnessWorkflow(state);
}
