import { chmod, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  createFxSubscriptionAuthenticationFiles,
  getFxSubscriptionRequestCredentials,
  readFxSubscriptions,
  resolveFxSubscriptionEnvironment,
} from './fx-subscription';

describe('resolveFxSubscriptionEnvironment', () => {
  it('never inspects subscriptions for AI Gateway auth', async () => {
    const env = { AI_GATEWAY_API_KEY: 'gateway-key' };
    await expect(
      resolveFxSubscriptionEnvironment({
        auth: 'ai-gateway',
        env,
        homeDirectory: '/does-not-exist',
      }),
    ).resolves.toBe(env);
  });

  it('prefers Gateway authentication over native subscriptions in auto mode', async () => {
    const env = { AI_GATEWAY_API_KEY: 'gateway-key' };
    await expect(
      resolveFxSubscriptionEnvironment({
        auth: 'auto',
        env,
        homeDirectory: '/does-not-exist',
      }),
    ).resolves.toBe(env);
  });

  it('uses native subscriptions in direct mode even when unrelated API keys exist', async () => {
    const homeDirectory = await createFxDirectory();
    const accessToken = createChatGptAccessToken({ accountId: 'account-1' });
    await writePrivateJson({
      path: join(homeDirectory, '.fx', 'chatgpt-auth.json'),
      value: createCredential({ accessToken, accountId: 'account-1' }),
    });

    await expect(
      resolveFxSubscriptionEnvironment({
        auth: 'direct',
        env: { OPENAI_API_KEY: 'unused-api-key' },
        homeDirectory,
      }),
    ).resolves.toEqual({
      OPENAI_API_KEY: 'unused-api-key',
      AI_SDK_FX_CHATGPT_ACCESS_TOKEN: accessToken,
      AI_SDK_FX_CHATGPT_ACCOUNT_ID: 'account-1',
    });
  });
});

describe('readFxSubscriptions', () => {
  it('reads the exact ChatGPT subscription record used by fx', async () => {
    const homeDirectory = await createFxDirectory();
    const accessToken = createChatGptAccessToken({ accountId: 'account-1' });
    await writePrivateJson({
      path: join(homeDirectory, '.fx', 'chatgpt-auth.json'),
      value: createCredential({ accessToken, accountId: 'account-1' }),
    });

    await expect(readFxSubscriptions({ homeDirectory })).resolves.toEqual({
      AI_SDK_FX_CHATGPT_ACCESS_TOKEN: accessToken,
      AI_SDK_FX_CHATGPT_ACCOUNT_ID: 'account-1',
    });
  });

  it('refreshes and persists an expiring Grok subscription', async () => {
    const homeDirectory = await createFxDirectory();
    const authPath = join(homeDirectory, '.fx', 'grok-auth.json');
    await writePrivateJson({
      path: authPath,
      value: createCredential({
        accessToken: 'old-access',
        refreshToken: 'old-refresh',
        accountId: 'account-1',
        expiresAt: Date.now() + 60_000,
      }),
    });
    const fetch = vi.fn(async (input: string | URL | Request) => {
      if (String(input) === 'https://auth.x.ai/oauth2/userinfo') {
        return new Response(JSON.stringify({ sub: 'account-1' }), {
          status: 200,
        });
      }
      return new Response(
        JSON.stringify({
          access_token: 'new-access',
          refresh_token: 'new-refresh',
          expires_in: 3600,
        }),
        { status: 200 },
      );
    });

    await expect(
      readFxSubscriptions({ homeDirectory, fetch }),
    ).resolves.toEqual({
      AI_SDK_FX_GROK_ACCESS_TOKEN: 'new-access',
      AI_SDK_FX_GROK_ACCOUNT_ID: 'account-1',
    });
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      'https://auth.x.ai/oauth2/token',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('refresh_token=old-refresh'),
      }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      'https://auth.x.ai/oauth2/userinfo',
      { headers: { Authorization: 'Bearer new-access' } },
    );
    await expect(readFile(authPath, 'utf8')).resolves.toContain('new-refresh');
  });

  it('uses JSON for ChatGPT refresh requests', async () => {
    const homeDirectory = await createFxDirectory();
    const authPath = join(homeDirectory, '.fx', 'chatgpt-auth.json');
    const oldAccessToken = createChatGptAccessToken({
      accountId: 'account-1',
    });
    const newAccessToken = createChatGptAccessToken({
      accountId: 'account-1',
    });
    await writePrivateJson({
      path: authPath,
      value: createCredential({
        accessToken: oldAccessToken,
        accountId: 'account-1',
        expiresAt: Date.now() + 60_000,
      }),
    });
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ access_token: newAccessToken, expires_in: 3600 }),
          { status: 200 },
        ),
    );

    await readFxSubscriptions({ homeDirectory, fetch });

    expect(fetch).toHaveBeenCalledWith(
      'https://auth.openai.com/oauth/token',
      expect.objectContaining({
        headers: expect.objectContaining({
          'content-type': 'application/json',
        }),
        body: expect.stringContaining('"grant_type":"refresh_token"'),
      }),
    );
  });

  it('ignores insecure and unrelated fx authentication files', async () => {
    const homeDirectory = await createFxDirectory();
    await writeFile(
      join(homeDirectory, '.fx', 'auth.json'),
      JSON.stringify(createCredential({ accessToken: 'gateway-access' })),
    );
    await writeFile(
      join(homeDirectory, '.fx', 'grok-auth.json'),
      JSON.stringify(createCredential({ accessToken: 'grok-access' })),
      { mode: 0o644 },
    );

    await expect(
      readFxSubscriptions({ homeDirectory }),
    ).resolves.toBeUndefined();
  });
});

describe('fx sandbox subscription records', () => {
  it('materializes broker placeholders instead of host tokens', () => {
    const hostAccessToken = createChatGptAccessToken({
      accountId: 'account-1',
    });
    const files = createFxSubscriptionAuthenticationFiles({
      env: {
        AI_SDK_FX_CHATGPT_ACCESS_TOKEN: hostAccessToken,
        AI_SDK_FX_CHATGPT_ACCOUNT_ID: 'account-1',
        AI_SDK_FX_GROK_ACCESS_TOKEN: 'grok-host-access',
        AI_SDK_FX_GROK_ACCOUNT_ID: 'account-2',
      },
      sandboxEnv: {
        AI_SDK_FX_CHATGPT_ACCESS_TOKEN: 'chatgpt-placeholder',
        AI_SDK_FX_GROK_ACCESS_TOKEN: 'grok-placeholder',
      },
      credentialBrokeringAvailable: true,
    });

    expect(files.map(file => file.path)).toEqual([
      '.fx/chatgpt-auth.json',
      '.fx/grok-auth.json',
    ]);
    const chatGpt = JSON.parse(files[0].content);
    const grok = JSON.parse(files[1].content);
    expect(chatGpt).toEqual({
      version: 1,
      access_token: expect.stringMatching(
        /^[^.]+\.[^.]+\.chatgpt-placeholder$/,
      ),
      refresh_token: 'ai-sdk-harness-brokered',
      expires_at_ms: Number.MAX_SAFE_INTEGER,
      account_id: 'account-1',
    });
    expect(grok).toMatchInlineSnapshot(`
      {
        "access_token": "grok-placeholder",
        "account_id": "account-2",
        "expires_at_ms": 9007199254740991,
        "refresh_token": "ai-sdk-harness-brokered",
        "version": 1,
      }
    `);
    expect(files.every(file => !file.content.includes(hostAccessToken))).toBe(
      true,
    );
    expect(
      files.every(file => !file.content.includes('grok-host-access')),
    ).toBe(true);
  });

  it('matches the access tokens fx will send from sandbox records', () => {
    const hostAccessToken = createChatGptAccessToken({
      accountId: 'account-1',
    });
    const env = {
      AI_SDK_FX_CHATGPT_ACCESS_TOKEN: hostAccessToken,
      AI_SDK_FX_CHATGPT_ACCOUNT_ID: 'account-1',
    };
    const sandboxEnv = {
      AI_SDK_FX_CHATGPT_ACCESS_TOKEN: 'chatgpt-placeholder',
    };
    const files = createFxSubscriptionAuthenticationFiles({
      env,
      sandboxEnv,
      credentialBrokeringAvailable: true,
    });
    const record = JSON.parse(files[0].content);

    expect(getFxSubscriptionRequestCredentials({ env, sandboxEnv })).toEqual([
      {
        provider: 'chatgpt',
        accessToken: hostAccessToken,
        sandboxAccessToken: record.access_token,
      },
    ]);
  });
});

async function createFxDirectory(): Promise<string> {
  const homeDirectory = await mkdtemp(join(tmpdir(), 'fx-auth-'));
  await mkdir(join(homeDirectory, '.fx'));
  return homeDirectory;
}

async function writePrivateJson({
  path,
  value,
}: {
  path: string;
  value: unknown;
}): Promise<void> {
  await writeFile(path, JSON.stringify(value), { mode: 0o600 });
  await chmod(path, 0o600);
}

function createCredential({
  accessToken,
  refreshToken = 'refresh-token',
  accountId = 'account-1',
  expiresAt = Date.now() + 60 * 60 * 1000,
}: {
  accessToken: string;
  refreshToken?: string;
  accountId?: string;
  expiresAt?: number;
}): Record<string, string | number> {
  return {
    version: 1,
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at_ms: expiresAt,
    account_id: accountId,
  };
}

function createChatGptAccessToken({
  accountId,
}: {
  accountId: string;
}): string {
  const header = Buffer.from('{}').toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      'https://api.openai.com/auth': { chatgpt_account_id: accountId },
    }),
  ).toString('base64url');
  return `${header}.${payload}.signature`;
}
