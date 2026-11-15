import { HarnessCapabilityUnsupportedError } from '@ai-sdk/harness';
import { defineCommand, Sandbox } from 'just-bash';
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

  it('installs realpath on first use of a native basic or network adaptation', async () => {
    const sandbox = await Sandbox.create();
    const exec = vi.spyOn(sandbox.bashEnvInstance, 'exec');
    const registerCommand = vi.spyOn(
      sandbox.bashEnvInstance,
      'registerCommand',
    );
    const basic = createJustBashSandboxSessionFromNativeSandbox(sandbox);
    const network =
      createJustBashNetworkSandboxSessionFromNativeSandbox(sandbox);

    expect(exec).not.toHaveBeenCalled();
    expect(registerCommand).not.toHaveBeenCalled();
    expect(await basic.run({ command: 'realpath /tmp' })).toMatchObject({
      exitCode: 0,
      stdout: '/tmp\n',
    });
    expect(
      await network.restricted().run({ command: 'realpath /tmp' }),
    ).toMatchObject({ exitCode: 0, stdout: '/tmp\n' });
    expect(
      exec.mock.calls.filter(([command]) => command === 'type realpath'),
    ).toHaveLength(1);
    expect(registerCommand).toHaveBeenCalledTimes(1);
  });

  it('does not replace a native realpath command', async () => {
    const sandbox = await Sandbox.create();
    sandbox.bashEnvInstance.registerCommand(
      defineCommand('realpath', async () => ({
        exitCode: 0,
        stdout: 'custom\n',
        stderr: '',
      })),
    );
    const registerCommand = vi.spyOn(
      sandbox.bashEnvInstance,
      'registerCommand',
    );
    const adapted =
      createJustBashNetworkSandboxSessionFromNativeSandbox(sandbox);

    expect(await adapted.run({ command: 'realpath /tmp' })).toMatchObject({
      exitCode: 0,
      stdout: 'custom\n',
    });
    expect(registerCommand).not.toHaveBeenCalled();
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
