import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createClaudeCodeSubscriptionRequestTransformations,
  readClaudeCodeSubscription,
} from './claude-code-subscription';

const mocks = vi.hoisted(() => ({
  execFileSync: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  execFileSync: mocks.execFileSync,
}));

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
    mocks.execFileSync.mockReturnValue(
      JSON.stringify({
        claudeAiOauth: {
          accessToken: 'keychain-access-token',
          refreshToken: 'keychain-refresh-token',
          expiresAt: Date.now() + 60 * 60 * 1000,
        },
      }),
    );

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
    expect(mocks.execFileSync).toHaveBeenCalledTimes(1);
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
