import type * as NodeChildProcess from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createClaudeCodeSubscriptionRequestTransformations,
  readClaudeCodeSubscription,
} from './claude-code-subscription';

const mocks = vi.hoisted(() => ({
  execFileAsync: vi.fn(),
  execFileSync: vi.fn(),
}));

vi.mock('node:child_process', async importOriginal => {
  const actual = await importOriginal<typeof NodeChildProcess>();
  const execFile = Object.assign(vi.fn(), {
    [Symbol.for('nodejs.util.promisify.custom')]: mocks.execFileAsync,
  });
  return { ...actual, execFile, execFileSync: mocks.execFileSync };
});

afterEach(() => {
  vi.resetAllMocks();
});

describe('readClaudeCodeSubscription', () => {
  it('falls back to macOS Keychain when the credential file has no Claude OAuth credential', async () => {
    const homeDirectory = await mkdtemp(join(tmpdir(), 'claude-home-'));
    const configDirectory = join(homeDirectory, '.claude');
    await mkdir(configDirectory, { recursive: true });
    await writeFile(
      join(configDirectory, '.credentials.json'),
      JSON.stringify({ mcpOAuth: {} }),
    );
    mocks.execFileAsync.mockResolvedValue({
      stdout: JSON.stringify({
        claudeAiOauth: {
          accessToken: 'keychain-access-token',
          refreshToken: 'keychain-refresh-token',
          expiresAt: Date.now() + 60 * 60 * 1000,
        },
      }),
      stderr: '',
    });

    await expect(
      readClaudeCodeSubscription({
        env: {},
        homeDirectory,
        platform: 'darwin',
      }),
    ).resolves.toEqual({
      CLAUDE_CODE_OAUTH_TOKEN: 'keychain-access-token',
      ANTHROPIC_BASE_URL: 'https://api.anthropic.com',
    });
    expect(mocks.execFileAsync).toHaveBeenCalledTimes(1);
  });
});

describe('createClaudeCodeSubscriptionRequestTransformations', () => {
  it('replaces only the OAuth authorization header', () => {
    expect(
      createClaudeCodeSubscriptionRequestTransformations({
        env: {
          CLAUDE_CODE_OAUTH_TOKEN: 'host-access-token',
          ANTHROPIC_BASE_URL: 'https://api.anthropic.com',
        },
        sandboxEnv: {
          CLAUDE_CODE_OAUTH_TOKEN: 'sandbox-placeholder',
          ANTHROPIC_BASE_URL: 'https://api.anthropic.com',
        },
        auth: 'direct',
      }),
    ).toEqual([
      {
        match: {
          host: 'api.anthropic.com',
          headers: [
            {
              key: { exact: 'Authorization' },
              value: { exact: 'Bearer sandbox-placeholder' },
            },
          ],
        },
        transform: {
          headers: {
            Authorization: 'Bearer host-access-token',
          },
        },
      },
    ]);
  });
});
