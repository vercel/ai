import { HarnessCapabilityUnsupportedError } from '@ai-sdk/harness';
import type { Sandbox, SandboxInfo } from 'e2b';
import { describe, expect, it, vi } from 'vitest';
import { setE2BNetworkPolicy, toE2BNetworkUpdate } from './e2b-network-policy';

function makeMockSandbox(network?: SandboxInfo['network']) {
  const getInfo = vi.fn(async () => ({ network }));
  const updateNetwork = vi.fn(async () => {});
  const sandbox = { getInfo, updateNetwork } as unknown as Sandbox;
  return { sandbox, spies: { getInfo, updateNetwork } };
}

describe('toE2BNetworkUpdate', () => {
  it('opens and closes all outbound access', () => {
    expect(toE2BNetworkUpdate({ mode: 'allow-all' })).toEqual({
      allowInternetAccess: true,
    });
    expect(toE2BNetworkUpdate({ mode: 'deny-all' })).toEqual({
      allowInternetAccess: false,
    });
  });

  it('pairs an allow list with a deny list that covers all traffic', () => {
    expect(
      toE2BNetworkUpdate({
        mode: 'custom',
        allowedHosts: ['api.example.com', '*.example.org'],
        allowedCIDRs: ['10.0.0.0/8'],
      }),
    ).toEqual({
      allowOut: ['api.example.com', '*.example.org', '10.0.0.0/8'],
      denyOut: ['0.0.0.0/0'],
    });
    expect(
      toE2BNetworkUpdate({ mode: 'custom', allowedCIDRs: ['1.1.1.1'] }),
    ).toEqual({ allowOut: ['1.1.1.1'], denyOut: ['0.0.0.0/0'] });
  });

  it('accepts an empty deny list and refuses a non-empty one', () => {
    expect(
      toE2BNetworkUpdate({
        mode: 'custom',
        allowedHosts: ['api.example.com'],
        deniedCIDRs: [],
      }),
    ).toEqual({ allowOut: ['api.example.com'], denyOut: ['0.0.0.0/0'] });

    let thrown: unknown;
    try {
      toE2BNetworkUpdate({
        mode: 'custom',
        allowedHosts: ['api.example.com'],
        deniedCIDRs: ['169.254.169.254/32'],
      });
    } catch (error) {
      thrown = error;
    }
    expect(HarnessCapabilityUnsupportedError.isInstance(thrown)).toBe(true);
    expect((thrown as Error).message).toContain('deniedCIDRs');
  });
});

describe('setE2BNetworkPolicy', () => {
  it('replaces the egress configuration of the sandbox', async () => {
    const { sandbox, spies } = makeMockSandbox({
      allowOut: ['old.example.com'],
      denyOut: ['0.0.0.0/0'],
      rules: {},
    });

    await setE2BNetworkPolicy({
      sandbox,
      policy: { mode: 'custom', allowedHosts: ['api.example.com'] },
    });

    expect(spies.updateNetwork).toHaveBeenCalledExactlyOnceWith({
      allowOut: ['api.example.com'],
      denyOut: ['0.0.0.0/0'],
    });
  });

  it('applies a policy to a sandbox without network configuration', async () => {
    const { sandbox, spies } = makeMockSandbox(undefined);

    await setE2BNetworkPolicy({ sandbox, policy: { mode: 'deny-all' } });

    expect(spies.updateNetwork).toHaveBeenCalledExactlyOnceWith({
      allowInternetAccess: false,
    });
  });

  it('refuses to drop an egress proxy', async () => {
    const { sandbox, spies } = makeMockSandbox({
      egressProxy: { address: 'proxy.example.com:1080' },
    });

    const result = setE2BNetworkPolicy({
      sandbox,
      policy: { mode: 'allow-all' },
    });

    await expect(result).rejects.toSatisfy(
      HarnessCapabilityUnsupportedError.isInstance,
    );
    await expect(result).rejects.toThrow('an egress proxy');
    expect(spies.updateNetwork).not.toHaveBeenCalled();
  });

  it('refuses to drop per-host transform rules', async () => {
    const { sandbox, spies } = makeMockSandbox({
      rules: {
        'api.example.com': [{ transform: { headers: { 'x-api-key': 'k' } } }],
      },
    });

    await expect(
      setE2BNetworkPolicy({ sandbox, policy: { mode: 'deny-all' } }),
    ).rejects.toThrow('per-host transform rules');
    expect(spies.updateNetwork).not.toHaveBeenCalled();
  });

  it('does not read the sandbox for a policy that cannot be applied', async () => {
    const { sandbox, spies } = makeMockSandbox();

    await expect(
      setE2BNetworkPolicy({
        sandbox,
        policy: {
          mode: 'custom',
          allowedHosts: ['api.example.com'],
          deniedCIDRs: ['10.0.0.0/8'],
        },
      }),
    ).rejects.toThrow('deniedCIDRs');
    expect(spies.getInfo).not.toHaveBeenCalled();
  });
});
