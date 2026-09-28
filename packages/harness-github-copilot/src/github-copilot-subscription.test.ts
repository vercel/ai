import { chmod, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type * as HarnessUtils from '@ai-sdk/harness/utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  findHostGitHubCliExecutable,
  readGitHubCopilotSubscription,
  resolveGitHubCopilotSubscriptionEnvironment,
} from './github-copilot-subscription';

const credentialStoreMocks = vi.hoisted(() => ({
  readLinuxSecretServicePassword: vi.fn(),
  readMacOSKeychainPassword: vi.fn(),
  readWindowsCredentialManagerPassword: vi.fn(),
}));

vi.mock('@ai-sdk/harness/utils', async importOriginal => {
  const actual = await importOriginal<typeof HarnessUtils>();
  return { ...actual, ...credentialStoreMocks };
});

describe('resolveGitHubCopilotSubscriptionEnvironment', () => {
  it('uses an explicit authentication environment without native discovery', async () => {
    const auth = { COPILOT_GITHUB_TOKEN: 'explicit-token' };
    const readSubscription = vi.fn();

    await expect(
      resolveGitHubCopilotSubscriptionEnvironment({
        auth,
        env: { COPILOT_GITHUB_TOKEN: 'process-token' },
        readSubscription,
      }),
    ).resolves.toBe(auth);
    expect(readSubscription).not.toHaveBeenCalled();
  });

  it('does not inspect native credentials for explicit Gateway auth', async () => {
    const env = { AI_GATEWAY_API_KEY: 'gateway-token' };
    const readSubscription = vi.fn();

    await expect(
      resolveGitHubCopilotSubscriptionEnvironment({
        auth: 'ai-gateway',
        env,
        readSubscription,
      }),
    ).resolves.toBe(env);
    expect(readSubscription).not.toHaveBeenCalled();
  });

  it('does not inspect native credentials when auto selects Gateway auth', async () => {
    const env = { AI_GATEWAY_API_KEY: 'gateway-token' };
    const readSubscription = vi.fn();

    await expect(
      resolveGitHubCopilotSubscriptionEnvironment({
        auth: 'auto',
        env,
        readSubscription,
      }),
    ).resolves.toBe(env);
    expect(readSubscription).not.toHaveBeenCalled();
  });

  it.each(['COPILOT_GITHUB_TOKEN', 'GH_TOKEN', 'GITHUB_TOKEN'] as const)(
    'prefers %s over native credentials',
    async environmentVariable => {
      const env = { [environmentVariable]: 'environment-token' };
      const readSubscription = vi.fn();

      await expect(
        resolveGitHubCopilotSubscriptionEnvironment({
          auth: 'direct',
          env,
          readSubscription,
        }),
      ).resolves.toBe(env);
      expect(readSubscription).not.toHaveBeenCalled();
    },
  );

  it('discovers native credentials for direct auth even with Gateway credentials', async () => {
    await expect(
      resolveGitHubCopilotSubscriptionEnvironment({
        auth: 'direct',
        env: { AI_GATEWAY_API_KEY: 'gateway-token' },
        readSubscription: async () => ({
          token: 'subscription-token',
          host: 'https://enterprise.example',
        }),
      }),
    ).resolves.toEqual({
      AI_GATEWAY_API_KEY: 'gateway-token',
      COPILOT_GITHUB_TOKEN: 'subscription-token',
      COPILOT_GH_HOST: 'enterprise.example',
    });
  });

  it('keeps the original environment when discovery finds no token', async () => {
    const env = { PATH: '/usr/bin' };

    await expect(
      resolveGitHubCopilotSubscriptionEnvironment({
        auth: 'direct',
        env,
        readSubscription: async () => undefined,
      }),
    ).resolves.toBe(env);
  });
});

describe('readGitHubCopilotSubscription', () => {
  beforeEach(() => {
    credentialStoreMocks.readLinuxSecretServicePassword.mockReset();
    credentialStoreMocks.readMacOSKeychainPassword.mockReset();
    credentialStoreMocks.readWindowsCredentialManagerPassword.mockReset();
  });

  it('reads the last logged-in account from the macOS Keychain', async () => {
    const copilotHome = await createCopilotHome({
      config: `
        // This file is managed by Copilot CLI.
        {
          "last_logged_in_user": {
            "host": "https://enterprise.example/",
            "login": "last-user",
          },
          "logged_in_users": [
            { "host": "https://github.com", "login": "first-user" }
          ],
          "copilotTokens": {
            "https://enterprise.example:last-user": "plaintext-token"
          },
        }
      `,
    });
    credentialStoreMocks.readMacOSKeychainPassword.mockResolvedValue(
      'secure-token',
    );

    await expect(
      readGitHubCopilotSubscription({
        env: { COPILOT_HOME: copilotHome },
        platform: 'darwin',
        findGitHubCliExecutable: async () => undefined,
      }),
    ).resolves.toEqual({
      token: 'secure-token',
      host: 'https://enterprise.example',
    });
    expect(
      credentialStoreMocks.readMacOSKeychainPassword,
    ).toHaveBeenCalledExactlyOnceWith({
      service: 'copilot-cli',
      account: 'https://enterprise.example:last-user',
    });
  });

  it('reads the selected account from Linux Secret Service', async () => {
    const copilotHome = await createCopilotHome({
      config: JSON.stringify({
        lastLoggedInUser: {
          host: 'https://github.com',
          login: 'octocat',
        },
      }),
    });
    credentialStoreMocks.readLinuxSecretServicePassword.mockResolvedValue(
      'secure-token',
    );

    await expect(
      readGitHubCopilotSubscription({
        env: { COPILOT_HOME: copilotHome },
        platform: 'linux',
        findGitHubCliExecutable: async () => undefined,
      }),
    ).resolves.toEqual({
      token: 'secure-token',
      host: 'https://github.com',
    });
    expect(
      credentialStoreMocks.readLinuxSecretServicePassword,
    ).toHaveBeenCalledExactlyOnceWith({
      attributes: {
        service: 'copilot-cli',
        username: 'https://github.com:octocat',
      },
    });
  });

  it('reads the selected account from Windows Credential Manager', async () => {
    const copilotHome = await createCopilotHome({
      config: JSON.stringify({
        lastLoggedInUser: {
          host: 'https://github.com',
          login: 'octocat',
        },
      }),
    });
    credentialStoreMocks.readWindowsCredentialManagerPassword.mockResolvedValue(
      'secure-token',
    );

    await expect(
      readGitHubCopilotSubscription({
        env: { COPILOT_HOME: copilotHome },
        platform: 'win32',
        findGitHubCliExecutable: async () => undefined,
      }),
    ).resolves.toEqual({
      token: 'secure-token',
      host: 'https://github.com',
    });
    expect(
      credentialStoreMocks.readWindowsCredentialManagerPassword,
    ).toHaveBeenCalledExactlyOnceWith({
      targetName: 'https://github.com:octocat.copilot-cli',
    });
  });

  it('does not read a secure credential on unsupported platforms', async () => {
    const copilotHome = await createCopilotHome({
      config: JSON.stringify({
        lastLoggedInUser: {
          host: 'https://github.com',
          login: 'octocat',
        },
      }),
    });

    await expect(
      readGitHubCopilotSubscription({
        env: { COPILOT_HOME: copilotHome },
        platform: 'freebsd',
        findGitHubCliExecutable: async () => undefined,
      }),
    ).resolves.toBeUndefined();
    expect(
      credentialStoreMocks.readLinuxSecretServicePassword,
    ).not.toHaveBeenCalled();
    expect(
      credentialStoreMocks.readMacOSKeychainPassword,
    ).not.toHaveBeenCalled();
    expect(
      credentialStoreMocks.readWindowsCredentialManagerPassword,
    ).not.toHaveBeenCalled();
  });

  it('uses the first logged-in account when no last account is stored', async () => {
    const copilotHome = await createCopilotHome({
      config: JSON.stringify({
        logged_in_users: [
          { host: 'invalid', login: '' },
          { host: 'https://github.com', login: 'first-valid-user' },
          { host: 'https://enterprise.example', login: 'second-user' },
        ],
      }),
    });
    const readSecureCredential = vi.fn(async () => 'secure-token');

    await readGitHubCopilotSubscription({
      env: { COPILOT_HOME: copilotHome },
      readSecureCredential,
      findGitHubCliExecutable: async () => undefined,
    });

    expect(readSecureCredential).toHaveBeenCalledWith({
      service: 'copilot-cli',
      account: 'https://github.com:first-valid-user',
    });
  });

  it('falls back to the plaintext token without writing native state', async () => {
    const copilotHome = await createCopilotHome({
      config: JSON.stringify({
        lastLoggedInUser: {
          host: 'https://github.com',
          login: 'octocat',
        },
        copilotTokens: {
          'https://github.com:octocat': 'plaintext-token',
        },
      }),
    });

    await expect(
      readGitHubCopilotSubscription({
        env: { COPILOT_HOME: copilotHome },
        readSecureCredential: async () => undefined,
        findGitHubCliExecutable: async () => undefined,
      }),
    ).resolves.toEqual({
      token: 'plaintext-token',
      host: 'https://github.com',
    });
  });

  it('does not select another stored account when the selected account has no token', async () => {
    const copilotHome = await createCopilotHome({
      config: JSON.stringify({
        lastLoggedInUser: {
          host: 'https://enterprise.example',
          login: 'selected-user',
        },
        loggedInUsers: [{ host: 'https://github.com', login: 'other-user' }],
        copilotTokens: {
          'https://github.com:other-user': 'other-token',
        },
      }),
    });
    const readSecureCredential = vi.fn(async () => undefined);

    await expect(
      readGitHubCopilotSubscription({
        env: { COPILOT_HOME: copilotHome },
        readSecureCredential,
        findGitHubCliExecutable: async () => undefined,
      }),
    ).resolves.toBeUndefined();
    expect(readSecureCredential).toHaveBeenCalledTimes(1);
    expect(readSecureCredential).toHaveBeenCalledWith({
      service: 'copilot-cli',
      account: 'https://enterprise.example:selected-user',
    });
  });

  it('uses the selected account host for the gh fallback', async () => {
    const copilotHome = await createCopilotHome({
      config: JSON.stringify({
        lastLoggedInUser: {
          host: 'https://enterprise.example',
          login: 'octocat',
        },
      }),
    });
    const readGitHubCliToken = vi.fn(async () => ' gh-token\n');

    await expect(
      readGitHubCopilotSubscription({
        env: { COPILOT_HOME: copilotHome, PATH: '/usr/bin' },
        readSecureCredential: async () => undefined,
        findGitHubCliExecutable: async () => '/usr/bin/gh',
        readGitHubCliToken,
      }),
    ).resolves.toEqual({
      token: 'gh-token',
      host: 'https://enterprise.example',
    });
    expect(readGitHubCliToken).toHaveBeenCalledWith({
      executable: '/usr/bin/gh',
      hostname: 'enterprise.example',
      env: { COPILOT_HOME: copilotHome, PATH: '/usr/bin' },
    });
  });

  it('uses the configured host for gh when no native account is stored', async () => {
    const readGitHubCliToken = vi.fn(async () => 'gh-token');

    await expect(
      readGitHubCopilotSubscription({
        env: { GH_HOST: 'enterprise.example', PATH: '/usr/local/bin' },
        homeDirectory: '/missing-home',
        readSecureCredential: async () => undefined,
        findGitHubCliExecutable: async () => '/usr/local/bin/gh',
        readGitHubCliToken,
      }),
    ).resolves.toEqual({
      token: 'gh-token',
      host: 'https://enterprise.example',
    });
    expect(readGitHubCliToken).toHaveBeenCalledWith(
      expect.objectContaining({
        hostname: 'enterprise.example',
      }),
    );
  });

  it('does not execute gh when it is unavailable on the host', async () => {
    const readGitHubCliToken = vi.fn();

    await expect(
      readGitHubCopilotSubscription({
        env: { PATH: '/missing-bin' },
        homeDirectory: '/missing-home',
        readSecureCredential: async () => undefined,
        findGitHubCliExecutable: async () => undefined,
        readGitHubCliToken,
      }),
    ).resolves.toBeUndefined();
    expect(readGitHubCliToken).not.toHaveBeenCalled();
  });

  it.each([undefined, '', '   '])(
    'returns no token when gh returns %j',
    async stdout => {
      await expect(
        readGitHubCopilotSubscription({
          env: { PATH: '/usr/bin' },
          homeDirectory: '/missing-home',
          readSecureCredential: async () => undefined,
          findGitHubCliExecutable: async () => '/usr/bin/gh',
          readGitHubCliToken: async () => stdout,
        }),
      ).resolves.toBeUndefined();
    },
  );

  it('ignores malformed native configuration', async () => {
    const copilotHome = await createCopilotHome({ config: '{ invalid' });
    const readSecureCredential = vi.fn();

    await expect(
      readGitHubCopilotSubscription({
        env: { COPILOT_HOME: copilotHome },
        readSecureCredential,
        findGitHubCliExecutable: async () => undefined,
      }),
    ).resolves.toBeUndefined();
    expect(readSecureCredential).not.toHaveBeenCalled();
  });
});

describe('findHostGitHubCliExecutable', () => {
  it('finds an executable in a Unix PATH', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'copilot-gh-bin-'));
    const executable = join(directory, 'gh');
    await writeFile(executable, '');
    await chmod(executable, 0o700);

    await expect(
      findHostGitHubCliExecutable({
        env: { PATH: `/missing:${directory}` },
        platform: 'linux',
      }),
    ).resolves.toBe(executable);
  });

  it('honors PATHEXT when finding a Windows executable', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'copilot-gh-bin-'));
    const executable = join(directory, 'gh.EXE');
    await writeFile(executable, '');

    await expect(
      findHostGitHubCliExecutable({
        env: {
          PATH: `C:\\missing;${directory}`,
          PATHEXT: '.EXE;.CMD',
        },
        platform: 'win32',
      }),
    ).resolves.toBe(executable);
  });

  it('returns undefined without a host PATH', async () => {
    await expect(
      findHostGitHubCliExecutable({ env: {}, platform: 'linux' }),
    ).resolves.toBeUndefined();
  });
});

async function createCopilotHome({
  config,
}: {
  config: string;
}): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'copilot-home-'));
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'config.json'), config);
  return directory;
}
