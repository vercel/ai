import type { Sandbox } from '@vercel/sandbox';
import { describe, expect, it, vi } from 'vitest';
import { createVercelSandbox } from './vercel-sandbox';

type MockSpies = {
  domain: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  runCommand: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  routes: Array<{ port: number }>;
};

function makeMockSandbox(overrides: Partial<MockSpies> = {}) {
  const domain = overrides.domain ?? vi.fn();
  const update = overrides.update ?? vi.fn(async () => {});
  const runCommand = overrides.runCommand ?? vi.fn();
  const stop = overrides.stop ?? vi.fn(async () => {});
  const routes: Array<{ port: number }> = overrides.routes ?? [{ port: 4000 }];
  const sandbox = {
    name: 'sbx_harness',
    domain,
    update,
    runCommand,
    stop,
    routes,
  } as unknown as Sandbox;
  return { sandbox, spies: { domain, update, runCommand, stop, routes } };
}

describe('createVercelSandbox (wrap existing)', () => {
  it('produces a handle whose ports come from sandbox.routes', async () => {
    const { sandbox } = makeMockSandbox({
      routes: [{ port: 3000 }, { port: 4000 }],
    });
    const provider = createVercelSandbox({ sandbox });
    const handle = await provider.create();
    expect(handle.ports).toEqual([3000, 4000]);
  });

  it('handle.session is an Experimental_Sandbox wrapping the underlying', async () => {
    const { sandbox, spies } = makeMockSandbox();
    spies.runCommand.mockResolvedValueOnce({
      exitCode: 0,
      stdout: async () => 'ok\n',
      stderr: async () => '',
    });

    const handle = await createVercelSandbox({ sandbox }).create();
    const result = await handle.session.run({ command: 'echo ok' });
    expect(result.stdout).toBe('ok\n');
  });

  it('handle.stop is a no-op (caller owns lifecycle)', async () => {
    const { sandbox, spies } = makeMockSandbox();
    await (await createVercelSandbox({ sandbox }).create()).stop();
    expect(spies.stop).not.toHaveBeenCalled();
  });

  describe('getPortUrl', () => {
    it('returns the value from sandbox.domain for https', async () => {
      const { sandbox, spies } = makeMockSandbox({
        routes: [{ port: 3000 }],
      });
      spies.domain.mockReturnValueOnce('https://sub.vercel.run');

      const handle = await createVercelSandbox({ sandbox }).create();
      const url = await handle.getPortUrl({ port: 3000 });
      expect(spies.domain).toHaveBeenCalledWith(3000);
      expect(url).toBe('https://sub.vercel.run/');
    });

    it('upgrades ws to wss when domain is https', async () => {
      const { sandbox, spies } = makeMockSandbox();
      spies.domain.mockReturnValueOnce('https://sub.vercel.run');
      const handle = await createVercelSandbox({ sandbox }).create();
      const url = await handle.getPortUrl({ port: 4000, protocol: 'ws' });
      expect(url).toBe('wss://sub.vercel.run/');
    });

    it('keeps ws as ws when domain is http', async () => {
      const { sandbox, spies } = makeMockSandbox();
      spies.domain.mockReturnValueOnce('http://sub.vercel.run');
      const handle = await createVercelSandbox({ sandbox }).create();
      const url = await handle.getPortUrl({ port: 4000, protocol: 'ws' });
      expect(url).toBe('ws://sub.vercel.run/');
    });

    it('throws when the requested port is not in the sandbox routes', async () => {
      const { sandbox } = makeMockSandbox({ routes: [{ port: 4000 }] });
      const handle = await createVercelSandbox({ sandbox }).create();
      await expect(handle.getPortUrl({ port: 9999 })).rejects.toThrow(
        /Port 9999 is not exposed/,
      );
    });
  });

  describe('setNetworkPolicy', () => {
    it('maps allow-all', async () => {
      const { sandbox, spies } = makeMockSandbox();
      const handle = await createVercelSandbox({ sandbox }).create();
      await handle.setNetworkPolicy!({ mode: 'allow-all' });
      expect(spies.update).toHaveBeenCalledWith({ networkPolicy: 'allow-all' });
    });

    it('maps deny-all', async () => {
      const { sandbox, spies } = makeMockSandbox();
      const handle = await createVercelSandbox({ sandbox }).create();
      await handle.setNetworkPolicy!({ mode: 'deny-all' });
      expect(spies.update).toHaveBeenCalledWith({ networkPolicy: 'deny-all' });
    });

    it('maps custom with allowedHosts to { allow: [...] }', async () => {
      const { sandbox, spies } = makeMockSandbox();
      const handle = await createVercelSandbox({ sandbox }).create();
      await handle.setNetworkPolicy!({
        mode: 'custom',
        allowedHosts: ['api.example.com', '*.npmjs.org'],
      });
      expect(spies.update).toHaveBeenCalledWith({
        networkPolicy: { allow: ['api.example.com', '*.npmjs.org'] },
      });
    });

    it('maps custom with allowedCIDRs to { subnets: { allow: [...] } }', async () => {
      const { sandbox, spies } = makeMockSandbox();
      const handle = await createVercelSandbox({ sandbox }).create();
      await handle.setNetworkPolicy!({
        mode: 'custom',
        allowedCIDRs: ['10.0.0.0/8'],
      });
      expect(spies.update).toHaveBeenCalledWith({
        networkPolicy: { subnets: { allow: ['10.0.0.0/8'] } },
      });
    });

    it('maps custom with allowedHosts + deniedCIDRs to combined shape', async () => {
      const { sandbox, spies } = makeMockSandbox();
      const handle = await createVercelSandbox({ sandbox }).create();
      await handle.setNetworkPolicy!({
        mode: 'custom',
        allowedHosts: ['api.example.com'],
        deniedCIDRs: ['169.254.169.254/32'],
      });
      expect(spies.update).toHaveBeenCalledWith({
        networkPolicy: {
          allow: ['api.example.com'],
          subnets: { deny: ['169.254.169.254/32'] },
        },
      });
    });

    it('maps custom with both allowedCIDRs + deniedCIDRs', async () => {
      const { sandbox, spies } = makeMockSandbox();
      const handle = await createVercelSandbox({ sandbox }).create();
      await handle.setNetworkPolicy!({
        mode: 'custom',
        allowedCIDRs: ['10.0.0.0/8'],
        deniedCIDRs: ['10.5.0.0/16'],
      });
      expect(spies.update).toHaveBeenCalledWith({
        networkPolicy: {
          subnets: { allow: ['10.0.0.0/8'], deny: ['10.5.0.0/16'] },
        },
      });
    });
  });

  describe('setPorts', () => {
    it('forwards the requested port list to sandbox.update', async () => {
      const { sandbox, spies } = makeMockSandbox();
      const handle = await createVercelSandbox({ sandbox }).create();
      await handle.setPorts!([4000, 5000]);
      expect(spies.update).toHaveBeenCalledWith(
        { ports: [4000, 5000] },
        undefined,
      );
    });
  });

  describe('bridgePorts', () => {
    it('is exposed on the provider when set on settings', () => {
      const { sandbox } = makeMockSandbox();
      const provider = createVercelSandbox({
        sandbox,
        bridgePorts: [5001, 5002],
      });
      expect(provider.bridgePorts).toEqual([5001, 5002]);
    });

    it('is undefined when not set', () => {
      const { sandbox } = makeMockSandbox();
      const provider = createVercelSandbox({ sandbox });
      expect(provider.bridgePorts).toBeUndefined();
    });
  });

  describe('setup', () => {
    it('is passed through from settings to provider', () => {
      const { sandbox } = makeMockSandbox();
      const setup = async () => {};
      const provider = createVercelSandbox({ sandbox, setup });
      expect(provider.setup).toBe(setup);
    });
  });
});
