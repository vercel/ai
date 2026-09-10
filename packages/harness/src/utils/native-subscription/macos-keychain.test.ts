import type * as NodeChildProcess from 'node:child_process';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readMacOSKeychainGenericPassword } from './macos-keychain';

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

describe('readMacOSKeychainGenericPassword', () => {
  it('reads and trims a generic password', async () => {
    mocks.execFileAsync.mockResolvedValue({
      stdout: 'stored-password\n',
      stderr: '',
    });

    await expect(
      readMacOSKeychainGenericPassword({
        service: 'service-name',
        account: 'account-name',
      }),
    ).resolves.toBe('stored-password');
    expect(mocks.execFileAsync).toHaveBeenCalledExactlyOnceWith(
      '/usr/bin/security',
      [
        'find-generic-password',
        '-s',
        'service-name',
        '-a',
        'account-name',
        '-w',
      ],
    );
  });

  it('returns undefined for empty output', async () => {
    mocks.execFileAsync.mockResolvedValue({ stdout: '\n', stderr: '' });

    await expect(
      readMacOSKeychainGenericPassword({ service: 'service', account: 'user' }),
    ).resolves.toBeUndefined();
  });

  it('returns undefined when the command fails', async () => {
    mocks.execFileAsync.mockRejectedValue(new Error('not found'));

    await expect(
      readMacOSKeychainGenericPassword({ service: 'service', account: 'user' }),
    ).resolves.toBeUndefined();
  });
});
