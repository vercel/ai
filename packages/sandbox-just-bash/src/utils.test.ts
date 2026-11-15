import { Sandbox } from 'just-bash';
import { describe, expect, it, vi } from 'vitest';
import { ensureRealpath } from './utils';

describe('ensureRealpath', () => {
  it('prepares a sandbox only once across concurrent calls', async () => {
    const sandbox = await Sandbox.create();
    const exec = vi.spyOn(sandbox.bashEnvInstance, 'exec');
    const registerCommand = vi.spyOn(
      sandbox.bashEnvInstance,
      'registerCommand',
    );

    await Promise.all([
      ensureRealpath(sandbox),
      ensureRealpath(sandbox),
      ensureRealpath(sandbox),
    ]);
    await ensureRealpath(sandbox);

    expect(
      exec.mock.calls.filter(([command]) => command === 'type realpath'),
    ).toHaveLength(1);
    expect(registerCommand).toHaveBeenCalledTimes(1);
  });

  it('retries after preparation fails', async () => {
    const sandbox = await Sandbox.create();
    const exec = vi
      .spyOn(sandbox.bashEnvInstance, 'exec')
      .mockRejectedValueOnce(new Error('temporary failure'));

    await expect(ensureRealpath(sandbox)).rejects.toThrow('temporary failure');
    await ensureRealpath(sandbox);

    expect(
      exec.mock.calls.filter(([command]) => command === 'type realpath'),
    ).toHaveLength(2);
    expect((await sandbox.bashEnvInstance.exec('realpath /tmp')).stdout).toBe(
      '/tmp\n',
    );
  });
});
