import { describe, expect, it } from 'vitest';
import { resolveClineEnv } from './cline-auth';

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
