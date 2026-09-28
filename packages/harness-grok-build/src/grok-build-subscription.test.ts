import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  readGrokBuildSubscription,
  resolveGrokBuildSubscriptionEnvironment,
} from './grok-build-subscription';

const scope = 'https://auth.x.ai::b1a00492-073a-47ea-816f-4c329264a828';

describe('resolveGrokBuildSubscriptionEnvironment', () => {
  it('does not read a subscription when Gateway auth is selected', async () => {
    await expect(
      resolveGrokBuildSubscriptionEnvironment({
        auth: 'ai-gateway',
        env: { AI_GATEWAY_API_KEY: 'gateway' },
      }),
    ).resolves.toEqual({ AI_GATEWAY_API_KEY: 'gateway' });
  });

  it('prefers an environment API key', async () => {
    await expect(
      resolveGrokBuildSubscriptionEnvironment({
        auth: 'direct',
        env: { XAI_API_KEY: 'environment-key' },
      }),
    ).resolves.toEqual({ XAI_API_KEY: 'environment-key' });
  });
});

describe('readGrokBuildSubscription', () => {
  it('reads a fresh scope-keyed OAuth record', async () => {
    const grokHome = await mkdtemp(join(tmpdir(), 'grok-auth-'));
    await writeFile(
      join(grokHome, 'auth.json'),
      JSON.stringify({
        [scope]: {
          key: 'access-token',
          refresh_token: 'refresh-token',
          expires_at: Date.now() + 3_600_000,
          auth_mode: 'personal',
        },
      }),
    );

    await expect(
      readGrokBuildSubscription({ env: { GROK_HOME: grokHome } }),
    ).resolves.toMatchObject({
      XAI_API_KEY: 'access-token',
      GROK_CLI_CHAT_PROXY_BASE_URL: 'https://cli-chat-proxy.grok.com/v1',
    });
  });

  it('discovers, refreshes, and persists an expiring record', async () => {
    const grokHome = await mkdtemp(join(tmpdir(), 'grok-auth-'));
    const authPath = join(grokHome, 'auth.json');
    await writeFile(
      authPath,
      JSON.stringify({
        [scope]: {
          key: 'old-access',
          refresh_token: 'old-refresh',
          expires_at: Date.now() + 60_000,
          email: 'person@example.com',
        },
      }),
    );
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ token_endpoint: 'https://auth.x.ai/oauth2/token' }),
      )
      .mockResolvedValueOnce(
        Response.json({
          access_token: 'new-access',
          refresh_token: 'new-refresh',
          expires_in: 3600,
        }),
      );

    await readGrokBuildSubscription({
      env: { GROK_HOME: grokHome },
      fetch,
    });
    expect(JSON.parse(await readFile(authPath, 'utf8'))[scope]).toMatchObject({
      key: 'new-access',
      refresh_token: 'new-refresh',
      email: 'person@example.com',
    });
  });
});
