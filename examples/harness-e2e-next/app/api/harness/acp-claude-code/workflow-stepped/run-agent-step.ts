import {
  runHarnessAgentStep,
  type HarnessWorkflowState,
} from '@ai-sdk/workflow-harness';

export async function runClaudeCodeACPStep(
  state: HarnessWorkflowState,
): Promise<HarnessWorkflowState> {
  'use step';

  const { claudeCodeACPSteppedWorkflowAgent } =
    await import('@/agent/harness/acp-claude-code/basic-stepped-agent');
  const { acquireHarnessSandboxSession } =
    await import('@/util/harness-sandbox-session');
  const sandboxSession = await acquireHarnessSandboxSession({
    agent: claudeCodeACPSteppedWorkflowAgent,
    sessionId: state.sessionId,
    ports: [4000],
    resumeFrom: state.resumeFrom,
    continueFrom: state.continueFrom,
  });
  return runHarnessAgentStep({
    agent: claudeCodeACPSteppedWorkflowAgent,
    state,
    sandboxSession,
  });
}
