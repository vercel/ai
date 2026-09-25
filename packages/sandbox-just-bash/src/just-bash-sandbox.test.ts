import { HarnessCapabilityUnsupportedError } from '@ai-sdk/harness';
import { Sandbox } from 'just-bash';
import { describe, expect, it, vi } from 'vitest';
import {
  createJustBashNetworkSandboxSession,
  createJustBashNetworkSandboxSessionFromNativeSandbox,
  createJustBashSandboxSessionFromNativeSandbox,
  resumeJustBashNetworkSandboxSession,
} from './just-bash-sandbox';

describe('new just-bash sandbox sessions', () => {
  it('prepares every new sandbox after installing realpath', async () => {
    const prepare = vi.fn(async ({ session }) => {
      expect((await session.run({ command: 'realpath /tmp' })).exitCode).toBe(
        0,
      );
    });
    const template = { identity: 'tools', prepare };
    const first = await createJustBashNetworkSandboxSession({ template });
    const second = await createJustBashNetworkSandboxSession({ template });
    expect(prepare).toHaveBeenCalledTimes(2);
    await first.destroy();
    await second.destroy();
  });

  it('adapts native sessions synchronously and delegates lifecycle calls', async () => {
    const sandbox = await Sandbox.create();
    const stop = vi.spyOn(sandbox, 'stop');
    expect(
      'stop' in createJustBashSandboxSessionFromNativeSandbox(sandbox),
    ).toBe(false);
    const adapted =
      createJustBashNetworkSandboxSessionFromNativeSandbox(sandbox);
    await adapted.stop();
    await adapted.destroy();
    expect(stop).toHaveBeenCalledTimes(2);
  });

  it('rejects a supplied native sandbox in the async creator', async () => {
    await expect(
      createJustBashNetworkSandboxSession({
        sandbox: await Sandbox.create(),
      } as never),
    ).rejects.toThrow('FromNativeSandbox');
  });

  it('accepts a custom ID as an in-process label without native lookup', async () => {
    const create = vi.spyOn(Sandbox, 'create');
    try {
      const first = await createJustBashNetworkSandboxSession({
        sandboxId: 'local-session',
      });
      const second = await createJustBashNetworkSandboxSession({
        sandboxId: 'local-session',
      });
      expect(first.id).toBe('local-session');
      expect(second.id).toBe('local-session');
      expect(first).not.toBe(second);
      expect(create).toHaveBeenCalledWith({});
      const unnamed = await createJustBashNetworkSandboxSession();
      expect(unnamed.id).not.toBe('local-session');
      await first.destroy();
      await second.destroy();
      await unnamed.destroy();
    } finally {
      create.mockRestore();
    }
  });

  it('reports that reattaching by ID is unsupported', async () => {
    const create = vi.spyOn(Sandbox, 'create');
    try {
      await expect(
        resumeJustBashNetworkSandboxSession({ sandboxId: 'local-session' }),
      ).rejects.toBeInstanceOf(HarnessCapabilityUnsupportedError);
      expect(create).not.toHaveBeenCalled();
      const controller = new AbortController();
      controller.abort();
      await expect(
        resumeJustBashNetworkSandboxSession({
          sandboxId: 'local-session',
          abortSignal: controller.signal,
        }),
      ).rejects.toMatchObject({ name: 'AbortError' });
    } finally {
      create.mockRestore();
    }
  });
});
