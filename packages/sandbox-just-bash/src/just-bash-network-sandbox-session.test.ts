import { HarnessCapabilityUnsupportedError } from '@ai-sdk/harness';
import { Sandbox } from 'just-bash';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JustBashNetworkSandboxSession } from './just-bash-network-sandbox-session';

describe('JustBashNetworkSandboxSession', () => {
  let sandbox: JustBashNetworkSandboxSession;

  beforeEach(async () => {
    sandbox = new JustBashNetworkSandboxSession({
      sandbox: await Sandbox.create({ cwd: '/work' }),
      ownsLifecycle: true,
    });
  });

  it('rejects getPortEndpoint because ports are unsupported', async () => {
    await expect(
      sandbox.getPortEndpoint({ port: 4319, protocol: 'ws' }),
    ).rejects.toBeInstanceOf(HarnessCapabilityUnsupportedError);
  });

  it('keeps getPortUrl as a compatibility wrapper', async () => {
    await expect(
      sandbox.getPortUrl({ port: 4319, protocol: 'ws' }),
    ).rejects.toBeInstanceOf(HarnessCapabilityUnsupportedError);
  });

  it('delegates destroy to stop', async () => {
    const stop = vi.spyOn(sandbox, 'stop');

    await sandbox.destroy();

    expect(stop).toHaveBeenCalledTimes(1);
  });
});
