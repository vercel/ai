import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  readFxSubscription,
  resolveFxSubscriptionEnvironment,
} from './fx-subscription';

describe('resolveFxSubscriptionEnvironment', () => {
  it('never inspects subscriptions for AI Gateway auth', async () => {
    const env = { AI_GATEWAY_API_KEY: 'gateway-key' };
    await expect(
      resolveFxSubscriptionEnvironment({
        auth: 'ai-gateway',
        env,
      }),
    ).resolves.toBe(env);
  });

  it('prefers provider API keys over native subscriptions', async () => {
    const env = { OPENAI_API_KEY: 'environment-key' };
    await expect(
      resolveFxSubscriptionEnvironment({ auth: 'direct', env }),
    ).resolves.toBe(env);
  });
});

describe('readFxSubscription', () => {
  it('reads ChatGPT subscription credentials from the fx host store', async () => {
    const homeDirectory = await mkdtemp(join(tmpdir(), 'fx-auth-'));
    await mkdir(join(homeDirectory, '.fx'));
    await writeFile(
      join(homeDirectory, '.fx', 'chatgpt-auth.json'),
      JSON.stringify({
        access_token: 'chatgpt-access',
        refresh_token: 'chatgpt-refresh',
        expires_at: Date.now() + 60 * 60 * 1000,
        account_id: 'account-1',
      }),
    );

    await expect(
      readFxSubscription({
        env: {},
        homeDirectory,
        model: 'openai/gpt-5.3-codex',
      }),
    ).resolves.toEqual({
      OPENAI_API_KEY: 'chatgpt-access',
      OPENAI_BASE_URL: 'https://chatgpt.com/backend-api/codex',
      FX_CHATGPT_ACCOUNT_ID: 'account-1',
    });
  });

  it('refreshes and persists an expiring Grok subscription', async () => {
    const homeDirectory = await mkdtemp(join(tmpdir(), 'fx-auth-'));
    const fxDirectory = join(homeDirectory, '.fx');
    const authPath = join(fxDirectory, 'grok-auth.json');
    await mkdir(fxDirectory);
    await writeFile(
      authPath,
      JSON.stringify({
        accessToken: 'old-access',
        refreshToken: 'old-refresh',
        expiresAt: Date.now() + 60_000,
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
      readFxSubscription({
        env: {},
        homeDirectory,
        model: 'xai/grok-4',
        fetch,
      }),
    ).resolves.toEqual({
      XAI_API_KEY: 'new-access',
      XAI_BASE_URL: 'https://api.x.ai/v1',
    });
    expect(fetch).toHaveBeenCalledWith(
      'https://auth.x.ai/oauth2/token',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('refresh_token=old-refresh'),
      }),
    );
    await expect(readFile(authPath, 'utf8')).resolves.toContain('new-refresh');
  });

  it('does not treat the fx Vercel auth store as a subscription', async () => {
    const homeDirectory = await mkdtemp(join(tmpdir(), 'fx-auth-'));
    await mkdir(join(homeDirectory, '.fx'));
    await writeFile(
      join(homeDirectory, '.fx', 'auth.json'),
      JSON.stringify({
        access_token: 'gateway-access',
        refresh_token: 'gateway-refresh',
        expires_at: Date.now() + 60 * 60 * 1000,
      }),
    );

    await expect(
      readFxSubscription({ env: {}, homeDirectory }),
    ).resolves.toBeUndefined();
  });
});
