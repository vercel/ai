import {
  HarnessCapabilityUnsupportedError,
  type HarnessV1NetworkPolicy,
} from '@ai-sdk/harness';
import type { Sandbox } from 'modal';
import {
  ALLOW_ALL_NETWORK_ALLOWLISTS,
  GRPC_STATUS_FAILED_PRECONDITION,
  MODAL_PROVIDER_ID,
  getErrorCode,
  hasSandboxFinishedMessage,
} from './utils';

type ModalNetworkAllowlists = {
  outboundCidrAllowlist: string[];
  outboundDomainAllowlist: string[];
};

/**
 * Maps the harness network policy onto Modal's two outbound allowlists, which
 * Modal combines additively. Modal has no deny list.
 */
export function toModalNetworkAllowlists(
  policy: HarnessV1NetworkPolicy,
): ModalNetworkAllowlists {
  switch (policy.mode) {
    case 'allow-all':
      return {
        outboundCidrAllowlist: [
          ...ALLOW_ALL_NETWORK_ALLOWLISTS.outboundCidrAllowlist,
        ],
        outboundDomainAllowlist: [
          ...ALLOW_ALL_NETWORK_ALLOWLISTS.outboundDomainAllowlist,
        ],
      };
    case 'deny-all':
      return { outboundCidrAllowlist: [], outboundDomainAllowlist: [] };
    case 'custom': {
      const allowedHosts = [...(policy.allowedHosts ?? [])];
      const allowedCIDRs = [...(policy.allowedCIDRs ?? [])];
      if ((policy.deniedCIDRs ?? []).length > 0) {
        throw createNetworkPolicyError(
          'Modal sandboxes have no deny list, so a custom network policy with deniedCIDRs cannot be applied.',
        );
      }
      if (allowedHosts.length === 0 && allowedCIDRs.length === 0) {
        throw createNetworkPolicyError(
          'Custom network policy requires at least one of allowedHosts or allowedCIDRs to be non-empty.',
        );
      }
      return {
        outboundCidrAllowlist: allowedCIDRs,
        outboundDomainAllowlist: allowedHosts,
      };
    }
  }
}

export async function setModalNetworkPolicy({
  sandbox,
  policy,
}: {
  sandbox: Sandbox;
  policy: HarnessV1NetworkPolicy;
}): Promise<void> {
  const allowlists = toModalNetworkAllowlists(policy);
  try {
    await sandbox.updateNetworkPolicy(allowlists);
  } catch (error) {
    if (
      getErrorCode(error) !== GRPC_STATUS_FAILED_PRECONDITION ||
      hasSandboxFinishedMessage(error)
    ) {
      throw error;
    }
    throw createNetworkPolicyError(
      'Modal cannot change the network policy of this sandbox. A sandbox accepts policy changes only when it was created with an outboundDomainAllowlist and without blockNetwork; createModalNetworkSandboxSession() does that unless blockNetwork or an allowlist is passed.',
      error,
    );
  }
}

function createNetworkPolicyError(
  message: string,
  cause?: unknown,
): HarnessCapabilityUnsupportedError {
  return new HarnessCapabilityUnsupportedError({
    harnessId: MODAL_PROVIDER_ID,
    message,
    ...(cause === undefined ? {} : { cause }),
  });
}
