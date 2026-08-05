import {
  loadResumeStep,
  persistResumeStep,
} from '@/util/workflow-resume-steps';
import type {
  SteppedHarnessWorkflowInput,
  SteppedHarnessWorkflowState,
} from '@/util/stepped-harness-workflow';
import { runCodexACPStep } from './run-agent-step';

export async function codexACPSteppedWorkflow(
  input: SteppedHarnessWorkflowInput,
) {
  'use workflow';

  const resumeFrom = await loadResumeStep(input.sessionId);
  let state: SteppedHarnessWorkflowState = {
    ...input,
    status: 'running',
    ...(resumeFrom != null ? { resumeFrom } : {}),
  };
  while (state.status === 'running') {
    state = await runCodexACPStep(state);
  }
  await persistResumeStep(state.sessionId, state.resumeFrom);
  if (state.status === 'failed') {
    throw new Error(state.error ?? 'stepped harness workflow failed');
  }
  return (
    state.finalResult ?? {
      sessionId: state.sessionId,
      finishReason: 'unknown',
    }
  );
}
