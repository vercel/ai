import type * as NodeChildProcess from 'node:child_process';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readWindowsCredentialManagerPassword } from './windows-credential-manager';

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

describe('readWindowsCredentialManagerPassword', () => {
  it('reads a password using the provided target name', async () => {
    mocks.execFileAsync.mockResolvedValue({
      stdout: ' stored-password ',
      stderr: '',
    });

    await expect(
      readWindowsCredentialManagerPassword({
        targetName: 'account.service',
      }),
    ).resolves.toBe(' stored-password ');
    expect(mocks.execFileAsync).toHaveBeenCalledExactlyOnceWith(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        expect.stringContaining(
          '[AISDKCredentialManager]::Read($env:AI_SDK_WINDOWS_CREDENTIAL_MANAGER_TARGET)',
        ),
      ],
      {
        env: {
          ...process.env,
          AI_SDK_WINDOWS_CREDENTIAL_MANAGER_SOURCE:
            expect.stringContaining('CredReadW'),
          AI_SDK_WINDOWS_CREDENTIAL_MANAGER_TARGET: 'account.service',
        },
        windowsHide: true,
      },
    );
  });

  it('returns undefined for empty output', async () => {
    mocks.execFileAsync.mockResolvedValue({ stdout: '', stderr: '' });

    await expect(
      readWindowsCredentialManagerPassword({ targetName: 'account.service' }),
    ).resolves.toBeUndefined();
  });

  it('returns undefined when the command fails', async () => {
    mocks.execFileAsync.mockRejectedValue(new Error('not found'));

    await expect(
      readWindowsCredentialManagerPassword({ targetName: 'account.service' }),
    ).resolves.toBeUndefined();
  });
});
