import { HarnessCapabilityUnsupportedError } from '@ai-sdk/harness';
import type { Sandbox } from 'modal';
import { describe, expect, it, vi } from 'vitest';
import {
  setModalNetworkPolicy,
  toModalNetworkAllowlists,
} from './modal-network-policy';

function makeMockSandbox(updateNetworkPolicy = vi.fn(async () => {})) {
  return {
    sandbox: { updateNetworkPolicy } as unknown as Sandbox,
    updateNetworkPolicy,
  };
}

describe('toModalNetworkAllowlists', () => {
  it('maps allow-all and deny-all onto both allowlists', () => {
    expect(toModalNetworkAllowlists({ mode: 'allow-all' })).toEqual({
      outboundCidrAllowlist: ['0.0.0.0/0'],
      outboundDomainAllowlist: ['*'],
    });
    expect(toModalNetworkAllowlists({ mode: 'deny-all' })).toEqual({
      outboundCidrAllowlist: [],
      outboundDomainAllowlist: [],
    });
  });

  it('maps custom hosts and CIDRs onto their allowlists', () => {
    expect(
      toModalNetworkAllowlists({
        mode: 'custom',
        allowedHosts: ['example.com', '*.github.com'],
      }),
    ).toEqual({
      outboundCidrAllowlist: [],
      outboundDomainAllowlist: ['example.com', '*.github.com'],
    });
    expect(
      toModalNetworkAllowlists({
        mode: 'custom',
        allowedHosts: ['example.com'],
        allowedCIDRs: ['10.0.0.0/8'],
        deniedCIDRs: [],
      }),
    ).toEqual({
      outboundCidrAllowlist: ['10.0.0.0/8'],
      outboundDomainAllowlist: ['example.com'],
    });
  });

  it('rejects a deny list, which Modal does not have', () => {
    const error = (() => {
      try {
        toModalNetworkAllowlists({
          mode: 'custom',
          allowedCIDRs: ['10.0.0.0/8'],
          deniedCIDRs: ['10.1.0.0/16'],
        });
      } catch (error) {
        return error as Error;
      }
    })();

    expect(HarnessCapabilityUnsupportedError.isInstance(error)).toBe(true);
    expect(error?.message).toContain('deniedCIDRs');
  });

  it('rejects a custom policy that allows nothing', () => {
    expect(() =>
      toModalNetworkAllowlists({ mode: 'custom', allowedHosts: [] }),
    ).toThrow(
      'Custom network policy requires at least one of allowedHosts or allowedCIDRs to be non-empty.',
    );
  });
});

describe('setModalNetworkPolicy', () => {
  it('replaces both allowlists of the running sandbox', async () => {
    const { sandbox, updateNetworkPolicy } = makeMockSandbox();

    await setModalNetworkPolicy({
      sandbox,
      policy: { mode: 'custom', allowedHosts: ['example.com'] },
    });

    expect(updateNetworkPolicy).toHaveBeenCalledExactlyOnceWith({
      outboundCidrAllowlist: [],
      outboundDomainAllowlist: ['example.com'],
    });
  });

  it('does not call Modal for a policy it cannot express', async () => {
    const { sandbox, updateNetworkPolicy } = makeMockSandbox();

    await expect(
      setModalNetworkPolicy({
        sandbox,
        policy: {
          mode: 'custom',
          allowedCIDRs: ['10.0.0.0/8'],
          deniedCIDRs: ['10.1.0.0/16'],
        },
      }),
    ).rejects.toThrow('deniedCIDRs');
    expect(updateNetworkPolicy).not.toHaveBeenCalled();
  });

  it('explains a sandbox that Modal cannot change', async () => {
    const refused = Object.assign(
      new Error(
        'FAILED_PRECONDITION: sandbox was created with open network access; restricting it while running is not currently supported',
      ),
      { code: 9 },
    );
    const { sandbox } = makeMockSandbox(vi.fn().mockRejectedValue(refused));

    const error = await setModalNetworkPolicy({
      sandbox,
      policy: { mode: 'deny-all' },
    }).catch(error => error);

    expect(HarnessCapabilityUnsupportedError.isInstance(error)).toBe(true);
    expect(error.message).toContain('outboundDomainAllowlist');
    expect(error.cause).toBe(refused);
  });

  it('surfaces other Modal failures unchanged', async () => {
    const invalid = Object.assign(
      new Error('outbound allowlist does not support IPv6 CIDRs: ::/0'),
      { code: 3 },
    );
    const { sandbox } = makeMockSandbox(vi.fn().mockRejectedValue(invalid));

    await expect(
      setModalNetworkPolicy({
        sandbox,
        policy: { mode: 'custom', allowedCIDRs: ['::/0'] },
      }),
    ).rejects.toBe(invalid);
  });
});
