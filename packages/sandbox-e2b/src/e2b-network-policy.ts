import {
  HarnessCapabilityUnsupportedError,
  type HarnessV1NetworkPolicy,
} from '@ai-sdk/harness';
import { ALL_TRAFFIC, type Sandbox, type SandboxNetworkUpdate } from 'e2b';
import { E2B_PROVIDER_ID } from './utils';

/**
 * Replaces the outbound network policy of a running E2B sandbox.
 *
 * E2B replaces the whole egress configuration on every update and does not
 * return the password of an egress proxy, so a sandbox that has an egress
 * proxy or per-host transform rules is refused instead of losing them.
 */
export async function setE2BNetworkPolicy({
  sandbox,
  policy,
}: {
  sandbox: Sandbox;
  policy: HarnessV1NetworkPolicy;
}): Promise<void> {
  const update = toE2BNetworkUpdate(policy);
  const { network } = await sandbox.getInfo();
  if (network?.egressProxy != null) {
    throw createUnsupportedConfigurationError('an egress proxy');
  }
  if (Object.keys(network?.rules ?? {}).length > 0) {
    throw createUnsupportedConfigurationError('per-host transform rules');
  }
  await sandbox.updateNetwork(update);
}

/**
 * Maps a harness network policy to E2B's allow and deny lists. E2B gives its
 * allow list precedence over its deny list, so an allow list is paired with a
 * deny list that covers all traffic.
 */
export function toE2BNetworkUpdate(
  policy: HarnessV1NetworkPolicy,
): SandboxNetworkUpdate {
  switch (policy.mode) {
    case 'allow-all':
      return { allowInternetAccess: true };
    case 'deny-all':
      return { allowInternetAccess: false };
    case 'custom': {
      if ((policy.deniedCIDRs?.length ?? 0) > 0) {
        throw new HarnessCapabilityUnsupportedError({
          harnessId: E2B_PROVIDER_ID,
          message:
            'E2B cannot apply deniedCIDRs: its allow list takes precedence over its deny list, so a denied range would not override the allowed hosts and ranges.',
        });
      }
      return {
        allowOut: [
          ...(policy.allowedHosts ?? []),
          ...(policy.allowedCIDRs ?? []),
        ],
        denyOut: [ALL_TRAFFIC],
      };
    }
  }
}

function createUnsupportedConfigurationError(
  configuration: string,
): HarnessCapabilityUnsupportedError {
  return new HarnessCapabilityUnsupportedError({
    harnessId: E2B_PROVIDER_ID,
    message: `E2B replaces the whole egress configuration when the network policy changes, which would drop ${configuration} from this sandbox. Change the policy with the native sandbox.updateNetwork() instead.`,
  });
}
