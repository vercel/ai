import type { Experimental_SandboxSession as SandboxSession } from '@ai-sdk/provider-utils';
import type { HarnessAgentSettings } from '../harness-agent-settings';
import type { HarnessAgentAdapter } from '../harness-agent-types';
import type { HarnessV1NetworkSandboxSession } from '../../v1';

/**
 * Build the `requestInstallConsent` callback handed to `doStart`.
 *
 * Resolution order:
 *  1. An explicit `onInstallRequest` setting always wins — `true`/`false`
 *     decide outright, a function is asked with the adapter's declared
 *     installation.
 *  2. Otherwise ownership decides: a provider-owned (disposable) sandbox
 *     permits installation, a user-owned environment denies it. Nothing is
 *     installed on a user's machine without explicit consent.
 *
 * Returns `undefined` when the adapter declares no installation — there is
 * nothing to consent to, and the absence lets adapters skip the check.
 */
export function buildRequestInstallConsent({
  harness,
  sandboxSession,
  onInstallRequest,
}: {
  harness: HarnessAgentAdapter;
  sandboxSession: HarnessV1NetworkSandboxSession | SandboxSession;
  onInstallRequest: HarnessAgentSettings['onInstallRequest'];
}): (() => Promise<boolean>) | undefined {
  const installation = harness.installation;
  if (installation == null) return undefined;

  return async () => {
    if (typeof onInstallRequest === 'boolean') return onInstallRequest;
    if (typeof onInstallRequest === 'function') {
      return await onInstallRequest({
        harnessId: harness.harnessId,
        executable: installation.executable,
        command: installation.command,
      });
    }
    const environmentOwner =
      'environmentOwner' in sandboxSession
        ? sandboxSession.environmentOwner
        : undefined;
    return (environmentOwner ?? 'provider') === 'provider';
  };
}
