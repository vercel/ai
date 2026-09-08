import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  createOpenCodeSubscriptionAuthContent,
  createOpenCodeSubscriptionRequestTransformations,
  readOpenCodeSubscription,
} from './opencode-subscription';

describe('readOpenCodeSubscription', () => {
  it.each([
    {
      providerId: 'xai',
      record: {
        type: 'oauth',
        access: 'xai-access',
        refresh: 'xai-refresh',
        expires: Date.now() + 60 * 60 * 1000,
      },
      accessToken: 'xai-access',
    },
    {
      providerId: 'github-copilot',
      record: {
        type: 'oauth',
        access: 'github-token',
        refresh: 'github-token',
        expires: 0,
      },
      accessToken: 'github-token',
    },
    {
      providerId: 'poe',
      record: {
        type: 'oauth',
        access: 'poe-key',
        refresh: 'poe-key',
        expires: Date.now() + 60 * 60 * 1000,
      },
      accessToken: 'poe-key',
    },
    {
      providerId: 'opencode-go',
      record: { type: 'api', key: 'go-key' },
      accessToken: 'go-key',
    },
    {
      providerId: 'gitlab',
      record: {
        type: 'oauth',
        access: 'gitlab-access',
        refresh: 'gitlab-refresh',
        expires: Date.now() + 60 * 60 * 1000,
      },
      accessToken: 'gitlab-access',
    },
  ])('reads $providerId from OPENCODE_AUTH_CONTENT', async testCase => {
    await expect(
      readOpenCodeSubscription({
        providerId: testCase.providerId,
        env: {
          OPENCODE_AUTH_CONTENT: JSON.stringify({
            [testCase.providerId]: testCase.record,
          }),
        },
      }),
    ).resolves.toMatchObject({
      providerId: testCase.providerId,
      accessToken: testCase.accessToken,
    });
  });

  it('refreshes an expiring OpenAI record in the XDG auth store', async () => {
    const homeDirectory = await mkdtemp(join(tmpdir(), 'opencode-auth-'));
    const authDirectory = join(homeDirectory, '.local', 'share', 'opencode');
    const authPath = join(authDirectory, 'auth.json');
    await mkdir(authDirectory, { recursive: true });
    await writeFile(
      authPath,
      JSON.stringify({
        openai: {
          type: 'oauth',
          access: 'old-access',
          refresh: 'old-refresh',
          expires: Date.now() + 60_000,
          accountId: 'account-1',
        },
      }),
    );
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            access_token: 'new-access',
            refresh_token: 'new-refresh',
            expires_in: 3600,
          }),
          { status: 200 },
        ),
    );

    await expect(
      readOpenCodeSubscription({
        providerId: 'openai',
        env: {},
        homeDirectory,
        fetch,
      }),
    ).resolves.toEqual({
      providerId: 'openai',
      accessToken: 'new-access',
      accountId: 'account-1',
    });
    expect(fetch).toHaveBeenCalledWith(
      'https://auth.openai.com/oauth/token',
      expect.objectContaining({
        body: expect.stringContaining('refresh_token=old-refresh'),
      }),
    );
    await expect(readFile(authPath, 'utf8')).resolves.toContain('new-refresh');
  });
});

describe('OpenCode sandbox authentication', () => {
  it('creates a sanitized non-expiring OAuth record', () => {
    const content = createOpenCodeSubscriptionAuthContent({
      authentication: {
        providerId: 'openai',
        accessToken: 'host-access',
        accountId: 'account-1',
      },
      accessToken: 'sandbox-access',
    });

    expect(JSON.parse(content)).toEqual({
      openai: {
        type: 'oauth',
        access: 'sandbox-access',
        refresh: 'host-managed',
        expires: Number.MAX_SAFE_INTEGER,
        accountId: 'account-1',
      },
    });
    expect(content).not.toContain('host-access');
  });

  it('brokers the sandbox token at the subscription request route', () => {
    expect(
      createOpenCodeSubscriptionRequestTransformations({
        authentication: {
          providerId: 'openai',
          accessToken: 'host-access',
          accountId: 'account-1',
        },
        sandboxAccessToken: 'sandbox-access',
      }),
    ).toEqual([
      {
        match: {
          host: 'chatgpt.com',
          path: { startsWith: '/backend-api/codex' },
          headers: [
            {
              key: { exact: 'Authorization' },
              value: { exact: 'Bearer sandbox-access' },
            },
          ],
        },
        transform: {
          headers: {
            Authorization: 'Bearer host-access',
            'ChatGPT-Account-Id': 'account-1',
          },
        },
      },
    ]);
  });
});
