import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { resolveClineEnv } from './cline-auth';
import {
  readClineSubscription,
  resolveClineAuthentication,
  resolveClineProviderSettingsPath,
} from './cline-subscription';

describe('resolveClineAuthentication', () => {
  it('never inspects native subscriptions for AI Gateway auth', async () => {
    const readSubscription = vi.fn();

    await expect(
      resolveClineAuthentication({
        auth: 'ai-gateway',
        env: { AI_GATEWAY_API_KEY: 'gateway-key' },
        readSubscription,
      }),
    ).resolves.toEqual({
      environment: {
        AI_GATEWAY_API_KEY: 'gateway-key',
        AI_GATEWAY_BASE_URL: 'https://ai-gateway.vercel.sh',
      },
    });
    expect(readSubscription).not.toHaveBeenCalled();
  });

  it('prefers an applicable environment API key over native subscriptions', async () => {
    const readSubscription = vi.fn();

    await expect(
      resolveClineAuthentication({
        auth: 'direct',
        env: { CLINE_API_KEY: 'environment-key' },
        readSubscription,
      }),
    ).resolves.toEqual({
      environment: { CLINE_API_KEY: 'environment-key' },
    });
    expect(readSubscription).not.toHaveBeenCalled();
  });

  it('uses a native subscription after direct environment credentials', async () => {
    const readSubscription = vi.fn(async () => 'subscription-key');

    await expect(
      resolveClineAuthentication({
        auth: 'direct',
        env: {},
        providerId: 'cline',
        readSubscription,
      }),
    ).resolves.toEqual({
      environment: {},
      subscriptionApiKey: 'subscription-key',
    });
  });
});

describe('readClineSubscription', () => {
  it('reads a current OAuth credential through the Cline token manager', async () => {
    const homeDirectory = await mkdtemp(join(tmpdir(), 'cline-auth-'));
    const settingsDirectory = join(homeDirectory, '.cline', 'data', 'settings');
    await mkdir(settingsDirectory, { recursive: true });
    await writeFile(
      join(settingsDirectory, 'providers.json'),
      JSON.stringify({
        version: 1,
        modes: {},
        providers: {
          cline: {
            settings: {
              provider: 'cline',
              auth: {
                accessToken: 'current-access-token',
                refreshToken: 'refresh-token',
                expiresAt: Date.now() + 60 * 60 * 1000,
              },
            },
            updatedAt: new Date().toISOString(),
            tokenSource: 'oauth',
          },
        },
      }),
    );

    await expect(
      readClineSubscription({
        providerId: 'cline',
        env: {},
        homeDirectory,
      }),
    ).resolves.toBe('workos:current-access-token');
  });
});

describe('resolveClineProviderSettingsPath', () => {
  it('honors the native path overrides', () => {
    expect(
      resolveClineProviderSettingsPath({
        env: { CLINE_PROVIDER_SETTINGS_PATH: '/custom/providers.json' },
        homeDirectory: '/home/me',
      }),
    ).toBe('/custom/providers.json');
    expect(
      resolveClineProviderSettingsPath({
        env: { CLINE_DATA_DIR: '/custom/data' },
        homeDirectory: '/home/me',
      }),
    ).toBe('/custom/data/settings/providers.json');
  });
});

describe('resolveClineEnv', () => {
  it('uses direct Cline credentials when direct mode is selected', () => {
    expect(
      resolveClineEnv({
        auth: 'direct',
        env: {
          CLINE_API_KEY: 'cline-key',
          CLINE_API_BASE_URL: 'https://cline.example',
          AI_GATEWAY_API_KEY: 'gateway-key',
        },
      }),
    ).toEqual({
      CLINE_API_KEY: 'cline-key',
      CLINE_API_BASE_URL: 'https://cline.example',
    });
  });

  it('uses an AI Gateway API key and the default Gateway URL', () => {
    expect(
      resolveClineEnv({
        auth: 'ai-gateway',
        env: { AI_GATEWAY_API_KEY: 'gateway-key' },
      }),
    ).toEqual({
      AI_GATEWAY_API_KEY: 'gateway-key',
      AI_GATEWAY_BASE_URL: 'https://ai-gateway.vercel.sh',
    });
  });

  it('uses a Vercel OIDC token and custom Gateway URL', () => {
    expect(
      resolveClineEnv({
        auth: 'ai-gateway',
        env: {
          VERCEL_OIDC_TOKEN: 'oidc-token',
          AI_GATEWAY_BASE_URL: 'https://gateway.example',
        },
      }),
    ).toEqual({
      AI_GATEWAY_API_KEY: 'oidc-token',
      AI_GATEWAY_BASE_URL: 'https://gateway.example',
    });
  });

  it('uses a supplied authentication environment without reading the host environment', () => {
    const env = { AI_GATEWAY_API_KEY: 'ambient-gateway-key' };

    expect(
      resolveClineEnv({
        auth: {
          AI_GATEWAY_API_KEY: 'explicit-gateway-key',
          AI_GATEWAY_BASE_URL: 'https://explicit.example',
        },
        env,
      }),
    ).toEqual({
      AI_GATEWAY_API_KEY: 'explicit-gateway-key',
      AI_GATEWAY_BASE_URL: 'https://explicit.example',
    });
    expect(env).toEqual({ AI_GATEWAY_API_KEY: 'ambient-gateway-key' });
  });

  it('rejects nested authentication objects before reading ambient credentials', () => {
    expect(() =>
      resolveClineEnv({
        auth: { gateway: { apiKey: 'legacy-key' } } as never,
        env: { AI_GATEWAY_API_KEY: 'ambient-gateway-key' },
      }),
    ).toThrow(
      'Invalid auth: expected an authentication mode or a flat record with string values.',
    );
  });

  it('prefers AI Gateway credentials in auto mode', () => {
    expect(
      resolveClineEnv({
        auth: 'auto',
        env: {
          CLINE_API_KEY: 'cline-key',
          AI_GATEWAY_API_KEY: 'gateway-key',
        },
      }),
    ).toEqual({
      AI_GATEWAY_API_KEY: 'gateway-key',
      AI_GATEWAY_BASE_URL: 'https://ai-gateway.vercel.sh',
    });
  });

  it('falls back to direct Cline credentials in auto mode', () => {
    expect(
      resolveClineEnv({
        env: {
          CLINE_API_KEY: 'cline-key',
          CLINE_API_BASE_URL: 'https://cline.example',
          AI_GATEWAY_BASE_URL: 'https://gateway.example',
        },
      }),
    ).toEqual({
      CLINE_API_KEY: 'cline-key',
      CLINE_API_BASE_URL: 'https://cline.example',
    });
  });

  it('pins explicit Gateway mode without falling back to a direct key', () => {
    expect(
      resolveClineEnv({
        auth: 'ai-gateway',
        env: { CLINE_API_KEY: 'cline-key' },
      }),
    ).toEqual({
      AI_GATEWAY_BASE_URL: 'https://ai-gateway.vercel.sh',
    });
  });
});
