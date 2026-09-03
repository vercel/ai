import { describe, expect, it } from 'vitest';
import {
  createCodexRequestTransformations,
  resolveCodexAuthenticationMode,
  resolveCodexEnv,
} from './codex-auth';

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
});
