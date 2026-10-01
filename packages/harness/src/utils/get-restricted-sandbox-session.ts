import type { Experimental_SandboxSession as SandboxSession } from '@ai-sdk/provider-utils';
import type { HarnessV1NetworkSandboxSession } from '../v1';

export function getRestrictedSandboxSession(
  sandboxSession: HarnessV1NetworkSandboxSession | SandboxSession,
): SandboxSession {
  return 'restricted' in sandboxSession
    ? sandboxSession.restricted()
    : sandboxSession;
}
