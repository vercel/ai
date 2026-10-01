import type * as NodeChildProcess from 'node:child_process';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readLinuxSecretServicePassword } from './linux-secret-service';

const mocks = vi.hoisted(() => ({
  execFileAsync: vi.fn(),
}));

vi.mock('node:child_process', async importOriginal => {
  const actual = await importOriginal<typeof NodeChildProcess>();
  const execFile = Object.assign(vi.fn(), {
    [Symbol.for('nodejs.util.promisify.custom')]: mocks.execFileAsync,
  });
  return { ...actual, execFile };
});

beforeEach(() => {
  mocks.execFileAsync.mockReset();
});

describe('readLinuxSecretServicePassword', () => {
  it('reads a password using the provided attributes', async () => {
    mocks.execFileAsync.mockResolvedValue({
      stdout: ' stored-password ',
      stderr: '',
    });

    await expect(
      readLinuxSecretServicePassword({
        attributes: {
          service: 'service-name',
          username: 'account-name',
          target: 'default',
        },
      }),
    ).resolves.toBe(' stored-password ');
    expect(mocks.execFileAsync).toHaveBeenCalledExactlyOnceWith('secret-tool', [
      'lookup',
      'service',
      'service-name',
      'username',
      'account-name',
      'target',
      'default',
    ]);
  });

  it('returns undefined for empty output', async () => {
    mocks.execFileAsync.mockResolvedValue({ stdout: '', stderr: '' });

    await expect(
      readLinuxSecretServicePassword({
        attributes: { service: 'service', username: 'user' },
      }),
    ).resolves.toBeUndefined();
  });

  it('returns undefined when the command fails', async () => {
    mocks.execFileAsync.mockRejectedValue(new Error('not found'));

    await expect(
      readLinuxSecretServicePassword({
        attributes: { service: 'service', username: 'user' },
      }),
    ).resolves.toBeUndefined();
  });
});
