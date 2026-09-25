import type { HarnessV1NetworkSandboxSession } from '@ai-sdk/harness';
import type {
  HarnessAgent,
  HarnessAgentContinueTurnState,
  HarnessAgentResumeSessionState,
} from '@ai-sdk/harness/agent';
import {
  createVercelNetworkSandboxSession,
  resumeVercelNetworkSandboxSession,
} from '@ai-sdk/sandbox-vercel';

export async function acquireHarnessSandboxSession({
  agent,
  sessionId,
  resumeFrom,
  continueFrom,
  ports,
}: {
  agent: Pick<HarnessAgent, 'getSandboxTemplate'>;
  sessionId: string;
  resumeFrom?: HarnessAgentResumeSessionState;
  continueFrom?: HarnessAgentContinueTurnState;
  ports?: number[];
}): Promise<HarnessV1NetworkSandboxSession> {
  const sandboxId = `ai-sdk-harness-session-${sessionId}`;
  if (resumeFrom != null || continueFrom != null) {
    return resumeVercelNetworkSandboxSession({ sandboxId });
  }

  return createVercelNetworkSandboxSession({
    sandboxId,
    runtime: 'node24',
    ...(ports == null ? {} : { ports }),
    template: await agent.getSandboxTemplate(),
  });
}
