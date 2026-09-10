import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  createCodexRequestTransformations,
  resolveCodexAuthenticationMode,
  resolveCodexEnv,
} from './codex-auth';
import {
  createCodexSubscriptionRequestTransformations,
  readCodexSubscription,
  resolveCodexAuthentication,
} from './codex-subscription';

function jwt(expiresAt: number): string {
  return `header.${Buffer.from(JSON.stringify({ exp: expiresAt })).toString('base64url')}.signature`;
}

describe('resolveCodexEnv', () => {
  it('uses direct OpenAI auth when selected', () => {
    const env = resolveCodexEnv('direct', {
      OPENAI_API_KEY: 'sk-direct',
      OPENAI_ORGANIZATION: 'org_1',
    });
    expect(env.CODEX_API_KEY).toBe('sk-direct');
    expect(env.OPENAI_ORGANIZATION).toBe('org_1');
  });

  it('routes through the gateway when gateway mode is selected', () => {
    const env = resolveCodexEnv('ai-gateway', {
      AI_GATEWAY_API_KEY: 'gw-key',
    });
    expect(env).toEqual({
      AI_GATEWAY_API_KEY: 'gw-key',
      CODEX_API_KEY: 'gw-key',
      AI_GATEWAY_BASE_URL: 'https://ai-gateway.vercel.sh/v1',
      OPENAI_BASE_URL: 'https://ai-gateway.vercel.sh/v1',
    });
  });

  it('appends /v1 to gateway base URLs for Codex', () => {
    const env = resolveCodexEnv('ai-gateway', {
      AI_GATEWAY_BASE_URL: 'https://gw.example',
      VERCEL_OIDC_TOKEN: 'oidc-env',
    });
    expect(env).toEqual({
      AI_GATEWAY_API_KEY: 'oidc-env',
      CODEX_API_KEY: 'oidc-env',
      AI_GATEWAY_BASE_URL: 'https://gw.example/v1',
      OPENAI_BASE_URL: 'https://gw.example/v1',
    });
  });

  it('preserves /v1 on gateway base URLs', () => {
    const env = resolveCodexEnv('ai-gateway', {
      AI_GATEWAY_BASE_URL: 'https://gw.example/v1',
      VERCEL_OIDC_TOKEN: 'oidc-env',
    });
    expect(env).toEqual({
      AI_GATEWAY_API_KEY: 'oidc-env',
      CODEX_API_KEY: 'oidc-env',
      AI_GATEWAY_BASE_URL: 'https://gw.example/v1',
      OPENAI_BASE_URL: 'https://gw.example/v1',
    });
  });

  it('auto-detects gateway when AI_GATEWAY_API_KEY is set', () => {
    const env = resolveCodexEnv(undefined, { AI_GATEWAY_API_KEY: 'gw-auto' });
    expect(env).toEqual({
      AI_GATEWAY_API_KEY: 'gw-auto',
      CODEX_API_KEY: 'gw-auto',
      AI_GATEWAY_BASE_URL: 'https://ai-gateway.vercel.sh/v1',
      OPENAI_BASE_URL: 'https://ai-gateway.vercel.sh/v1',
    });
  });

  it('auto-detects gateway when VERCEL_OIDC_TOKEN is set', () => {
    const env = resolveCodexEnv(undefined, { VERCEL_OIDC_TOKEN: 'oidc-auto' });
    expect(env).toEqual({
      AI_GATEWAY_API_KEY: 'oidc-auto',
      CODEX_API_KEY: 'oidc-auto',
      AI_GATEWAY_BASE_URL: 'https://ai-gateway.vercel.sh/v1',
      OPENAI_BASE_URL: 'https://ai-gateway.vercel.sh/v1',
    });
  });

  it('auto-detects direct openai when only OPENAI_API_KEY is set', () => {
    const env = resolveCodexEnv(undefined, { OPENAI_API_KEY: 'sk-auto' });
    expect(env).toEqual({ CODEX_API_KEY: 'sk-auto' });
  });

  it('uses a supplied authentication environment instead of ambient credentials', () => {
    const auth = { OPENAI_API_KEY: 'programmatic-openai-key' };

    expect(
      resolveCodexEnv(auth, { AI_GATEWAY_API_KEY: 'ambient-gateway-key' }),
    ).toEqual({ CODEX_API_KEY: 'programmatic-openai-key' });
    expect(
      resolveCodexAuthenticationMode(auth, {
        AI_GATEWAY_API_KEY: 'ambient-gateway-key',
      }),
    ).toBe('direct');
  });

  it('rejects nested authentication objects before reading ambient credentials', () => {
    const auth = { openai: { apiKey: 'legacy-key' } } as never;

    expect(() =>
      resolveCodexEnv(auth, {
        AI_GATEWAY_API_KEY: 'ambient-gateway-key',
      }),
    ).toThrow(
      'Invalid auth: expected an authentication mode or a flat record with string values.',
    );
    expect(() =>
      resolveCodexAuthenticationMode(auth, {
        AI_GATEWAY_API_KEY: 'ambient-gateway-key',
      }),
    ).toThrow(
      'Invalid auth: expected an authentication mode or a flat record with string values.',
    );
  });

  it('forwards host OPENAI_BASE_URL alongside the api key', () => {
    const env = resolveCodexEnv(undefined, {
      OPENAI_API_KEY: 'sk-auto',
      OPENAI_BASE_URL: 'https://ai-gateway.vercel.sh',
    });
    expect(env).toEqual({
      CODEX_API_KEY: 'sk-auto',
      OPENAI_BASE_URL: 'https://ai-gateway.vercel.sh',
    });
  });

  it('returns an empty env when nothing is configured', () => {
    const env = resolveCodexEnv(undefined, {});
    expect(env).toEqual({});
  });

  it('supports string authentication modes', () => {
    expect(resolveCodexEnv('direct', { OPENAI_API_KEY: 'sk-direct' })).toEqual({
      CODEX_API_KEY: 'sk-direct',
    });

    expect(
      resolveCodexEnv('ai-gateway', { AI_GATEWAY_API_KEY: 'gw-mode' }),
    ).toEqual({
      AI_GATEWAY_API_KEY: 'gw-mode',
      CODEX_API_KEY: 'gw-mode',
      AI_GATEWAY_BASE_URL: 'https://ai-gateway.vercel.sh/v1',
      OPENAI_BASE_URL: 'https://ai-gateway.vercel.sh/v1',
    });
  });
});

describe('resolveCodexAuthenticationMode', () => {
  it('preserves direct auth despite ambient Gateway credentials', () => {
    expect(
      resolveCodexAuthenticationMode('direct', {
        AI_GATEWAY_API_KEY: 'gateway-key',
      }),
    ).toBe('direct');
  });

  it('resolves ambient Gateway credentials to Gateway auth', () => {
    expect(
      resolveCodexAuthenticationMode(undefined, {
        VERCEL_OIDC_TOKEN: 'oidc-token',
      }),
    ).toBe('ai-gateway');
  });
});

describe('resolveCodexAuthentication', () => {
  it('never reads native authentication for Gateway auth', async () => {
    const readSubscription = vi.fn();
    await expect(
      resolveCodexAuthentication({
        auth: 'ai-gateway',
        processEnv: { AI_GATEWAY_API_KEY: 'gateway' },
        readSubscription,
      }),
    ).resolves.toMatchObject({
      environment: { AI_GATEWAY_API_KEY: 'gateway' },
    });
    expect(readSubscription).not.toHaveBeenCalled();
  });

  it('prefers a direct environment API key over native authentication', async () => {
    const readSubscription = vi.fn();
    await expect(
      resolveCodexAuthentication({
        auth: 'direct',
        processEnv: { OPENAI_API_KEY: 'environment-key' },
        readSubscription,
      }),
    ).resolves.toEqual({
      environment: { CODEX_API_KEY: 'environment-key' },
    });
    expect(readSubscription).not.toHaveBeenCalled();
  });

  it('uses a fresh file-backed ChatGPT subscription', async () => {
    const codexHome = await mkdtemp(join(tmpdir(), 'codex-auth-'));
    await writeFile(
      join(codexHome, 'auth.json'),
      JSON.stringify({
        auth_mode: 'chatgpt',
        tokens: {
          access_token: jwt(Math.floor(Date.now() / 1000) + 3600),
          refresh_token: 'refresh-token',
          account_id: 'account-id',
        },
      }),
    );

    await expect(
      readCodexSubscription({ env: { CODEX_HOME: codexHome } }),
    ).resolves.toEqual({
      environment: {
        CODEX_API_KEY: expect.stringMatching(/^header\./),
        OPENAI_BASE_URL: 'https://chatgpt.com/backend-api/codex',
      },
      requestHeaders: { 'ChatGPT-Account-ID': 'account-id' },
    });
  });

  it('refreshes and persists an expiring subscription without losing fields', async () => {
    const codexHome = await mkdtemp(join(tmpdir(), 'codex-auth-'));
    const authPath = join(codexHome, 'auth.json');
    await writeFile(
      authPath,
      JSON.stringify({
        auth_mode: 'chatgpt',
        preserved: true,
        tokens: {
          id_token: 'id-token',
          access_token: jwt(Math.floor(Date.now() / 1000) + 60),
          refresh_token: 'old-refresh',
          account_id: 'account-id',
        },
      }),
    );
    const fetch = vi.fn(async () =>
      Response.json({
        access_token: jwt(Math.floor(Date.now() / 1000) + 3600),
        refresh_token: 'new-refresh',
      }),
    );

    await readCodexSubscription({
      env: { CODEX_HOME: codexHome },
      fetch,
    });
    const persisted = JSON.parse(await readFile(authPath, 'utf8'));
    expect(persisted).toMatchObject({
      preserved: true,
      tokens: {
        id_token: 'id-token',
        refresh_token: 'new-refresh',
        account_id: 'account-id',
      },
    });
  });

  it('uses the configured Codex keyring before the auth file in auto mode', async () => {
    const codexHome = await mkdtemp(join(tmpdir(), 'codex-auth-'));
    await writeFile(
      join(codexHome, 'auth.json'),
      JSON.stringify({
        auth_mode: 'chatgpt',
        tokens: {
          access_token: jwt(Math.floor(Date.now() / 1000) + 3600),
          refresh_token: 'file-refresh-token',
          account_id: 'file-account',
        },
      }),
    );
    const keyringAccessToken = jwt(Math.floor(Date.now() / 1000) + 3600);
    const keyring = {
      read: vi.fn(async () =>
        JSON.stringify({
          auth_mode: 'chatgpt',
          tokens: {
            access_token: keyringAccessToken,
            refresh_token: 'keyring-refresh-token',
            account_id: 'keyring-account',
          },
        }),
      ),
      write: vi.fn(async () => {}),
    };

    await expect(
      readCodexSubscription({
        env: { CODEX_HOME: codexHome },
        authCredentialsStoreMode: 'auto',
        keyring,
      }),
    ).resolves.toEqual({
      environment: {
        CODEX_API_KEY: keyringAccessToken,
        OPENAI_BASE_URL: 'https://chatgpt.com/backend-api/codex',
      },
      requestHeaders: { 'ChatGPT-Account-ID': 'keyring-account' },
    });
  });

  it('reads the Codex credential store mode from config.toml', async () => {
    const codexHome = await mkdtemp(join(tmpdir(), 'codex-auth-'));
    await writeFile(
      join(codexHome, 'config.toml'),
      'cli_auth_credentials_store = "keyring"\n',
    );
    const keyringAccessToken = jwt(Math.floor(Date.now() / 1000) + 3600);
    const keyring = {
      read: vi.fn(async () =>
        JSON.stringify({
          auth_mode: 'chatgpt',
          tokens: {
            access_token: keyringAccessToken,
            refresh_token: 'refresh-token',
          },
        }),
      ),
      write: vi.fn(async () => {}),
    };

    await expect(
      readCodexSubscription({
        env: { CODEX_HOME: codexHome },
        keyring,
      }),
    ).resolves.toMatchObject({
      environment: { CODEX_API_KEY: keyringAccessToken },
    });
    expect(keyring.read).toHaveBeenCalledExactlyOnceWith({
      service: 'Codex Auth',
      account: expect.stringMatching(/^cli\|[0-9a-f]{16}$/),
    });
  });

  it('does not inspect persistent storage in ephemeral mode', async () => {
    const keyring = {
      read: vi.fn(),
      write: vi.fn(),
    };
    await expect(
      readCodexSubscription({
        authCredentialsStoreMode: 'ephemeral',
        keyring,
      }),
    ).resolves.toBeUndefined();
    expect(keyring.read).not.toHaveBeenCalled();
  });
});

describe('createCodexRequestTransformations', () => {
  it('uses the configured OpenAI-compatible route for direct auth', () => {
    expect(
      createCodexRequestTransformations({
        env: {
          CODEX_API_KEY: 'openai-secret',
          OPENAI_BASE_URL: 'https://openai.example/v1',
        },
        sandboxEnv: { CODEX_API_KEY: 'sandbox-openai-secret' },
        auth: 'direct',
      }),
    ).toEqual([
      {
        match: {
          host: 'openai.example',
          path: { startsWith: '/v1' },
          headers: [
            {
              key: { exact: 'Authorization' },
              value: { exact: 'Bearer sandbox-openai-secret' },
            },
          ],
        },
        transform: {
          headers: { Authorization: 'Bearer openai-secret' },
        },
      },
    ]);
  });

  it('falls back to the AI Gateway endpoint for Gateway auth', () => {
    expect(
      createCodexRequestTransformations({
        env: { CODEX_API_KEY: 'gateway-secret' },
        sandboxEnv: { CODEX_API_KEY: 'sandbox-gateway-secret' },
        auth: 'ai-gateway',
      }),
    ).toEqual([
      {
        match: {
          host: 'ai-gateway.vercel.sh',
          path: { startsWith: '/v1' },
          headers: [
            {
              key: { exact: 'Authorization' },
              value: { exact: 'Bearer sandbox-gateway-secret' },
            },
          ],
        },
        transform: {
          headers: { Authorization: 'Bearer gateway-secret' },
        },
      },
    ]);
  });

  it('does not create a transformation without a credential', () => {
    expect(
      createCodexRequestTransformations({
        env: {},
        sandboxEnv: {},
        auth: 'direct',
      }),
    ).toEqual([]);
  });

  it('adds the ChatGPT account header only at the host boundary', () => {
    expect(
      createCodexSubscriptionRequestTransformations({
        env: {
          CODEX_API_KEY: 'host-access-token',
          OPENAI_BASE_URL: 'https://chatgpt.com/backend-api/codex',
        },
        sandboxEnv: { CODEX_API_KEY: 'sandbox-placeholder' },
        auth: 'direct',
        requestHeaders: { 'ChatGPT-Account-ID': 'account-id' },
      }),
    ).toEqual([
      expect.objectContaining({
        transform: {
          headers: {
            Authorization: 'Bearer host-access-token',
            'ChatGPT-Account-ID': 'account-id',
          },
        },
      }),
    ]);
  });
});
