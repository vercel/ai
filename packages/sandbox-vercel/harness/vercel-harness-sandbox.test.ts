import type { Sandbox } from '@vercel/sandbox';
import { describe, expect, it, vi } from 'vitest';
import { VercelHarnessSandbox } from './vercel-harness-sandbox';

function makeMockSandbox() {
  const domain = vi.fn();
  const update = vi.fn(async () => {});
  const runCommand = vi.fn();
  const sandbox = {
    name: 'sbx_harness',
    domain,
    update,
    runCommand,
  } as unknown as Sandbox;
  return { sandbox, spies: { domain, update, runCommand } };
}

describe('VercelHarnessSandbox', () => {
  describe('getPortUrl', () => {
    it('returns the value from sandbox.domain when protocol is https', async () => {
      const { sandbox, spies } = makeMockSandbox();
      spies.domain.mockReturnValueOnce('https://sub.vercel.run');

      const url = await new VercelHarnessSandbox(sandbox).getPortUrl({
        port: 3000,
      });

      expect(spies.domain).toHaveBeenCalledWith(3000);
      expect(url).toBe('https://sub.vercel.run');
    });

    it('rewrites the scheme for http', async () => {
      const { sandbox, spies } = makeMockSandbox();
      spies.domain.mockReturnValueOnce('https://sub.vercel.run');

      const url = await new VercelHarnessSandbox(sandbox).getPortUrl({
        port: 80,
        protocol: 'http',
      });

      expect(url).toBe('http://sub.vercel.run');
    });

    it('rewrites the scheme for ws', async () => {
      const { sandbox, spies } = makeMockSandbox();
      spies.domain.mockReturnValueOnce('https://sub.vercel.run');

      const url = await new VercelHarnessSandbox(sandbox).getPortUrl({
        port: 81,
        protocol: 'ws',
      });

      expect(url).toBe('ws://sub.vercel.run');
    });
  });

  describe('setNetworkPolicy', () => {
    it('maps allow-all', async () => {
      const { sandbox, spies } = makeMockSandbox();
      await new VercelHarnessSandbox(sandbox).setNetworkPolicy({
        mode: 'allow-all',
      });
      expect(spies.update).toHaveBeenCalledWith({ networkPolicy: 'allow-all' });
    });

    it('maps deny-all', async () => {
      const { sandbox, spies } = makeMockSandbox();
      await new VercelHarnessSandbox(sandbox).setNetworkPolicy({
        mode: 'deny-all',
      });
      expect(spies.update).toHaveBeenCalledWith({ networkPolicy: 'deny-all' });
    });

    it('maps allowlist to { allow: [...hosts] }', async () => {
      const { sandbox, spies } = makeMockSandbox();
      await new VercelHarnessSandbox(sandbox).setNetworkPolicy({
        mode: 'allowlist',
        hosts: ['api.example.com', '*.npmjs.org'],
      });
      expect(spies.update).toHaveBeenCalledWith({
        networkPolicy: { allow: ['api.example.com', '*.npmjs.org'] },
      });
    });
  });

  describe('base behaviour', () => {
    it('inherits VercelSandbox methods', async () => {
      const { sandbox, spies } = makeMockSandbox();
      spies.runCommand.mockResolvedValueOnce({
        exitCode: 0,
        stdout: async () => 'ok\n',
        stderr: async () => '',
      });

      const result = await new VercelHarnessSandbox(sandbox).runCommand({
        command: 'echo ok',
      });
      expect(result.stdout).toBe('ok\n');
    });
  });
});
