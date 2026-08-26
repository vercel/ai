import { describe, expect, it, vi } from 'vitest';
import {
  createCodexRequestTransformations,
  resolveCodexAuthenticationMode,
  resolveCodexEnv,
} from './codex-auth';

describe('resolveCodexEnv', () => {
  it('uses openai-compatible auth when given', () => {
    const env = resolveCodexEnv(
      {
        openaiCompatible: {
          apiKey: 'sk-x',
          baseUrl: 'https://x.example.com',
          modelProviderName: 'X',
        },
      },
      {},
    );
    expect(env).toEqual({
      CODEX_API_KEY: 'sk-x',
      OPENAI_BASE_URL: 'https://x.example.com',
      CODEX_MODEL_PROVIDER_NAME: 'X',
    });
  });

  it('uses explicit openai auth when given', () => {
    const env = resolveCodexEnv(
      { openai: { apiKey: 'sk-direct', organization: 'org_1' } },
      { OPENAI_API_KEY: 'sk-env' },
    );
    expect(env.CODEX_API_KEY).toBe('sk-direct');
    expect(env.OPENAI_ORGANIZATION).toBe('org_1');
  });

  it('routes through the gateway when gateway option is given', () => {
    const env = resolveCodexEnv({ gateway: { apiKey: 'gw-key' } }, {});
    expect(env).toEqual({
      AI_GATEWAY_API_KEY: 'gw-key',
      CODEX_API_KEY: 'gw-key',
      AI_GATEWAY_BASE_URL: 'https://ai-gateway.vercel.sh/v1',
      OPENAI_BASE_URL: 'https://ai-gateway.vercel.sh/v1',
    });
  });

  it('appends /v1 to gateway base URLs for Codex', () => {
    const env = resolveCodexEnv(
      { gateway: { baseUrl: 'https://gw.example' } },
      { VERCEL_OIDC_TOKEN: 'oidc-env' },
    );
    expect(env).toEqual({
      AI_GATEWAY_API_KEY: 'oidc-env',
      CODEX_API_KEY: 'oidc-env',
      AI_GATEWAY_BASE_URL: 'https://gw.example/v1',
      OPENAI_BASE_URL: 'https://gw.example/v1',
    });
  });

  it('uses env gateway auth when gateway option only sets base URL', () => {
    const env = resolveCodexEnv(
      { gateway: { baseUrl: 'https://gw.example/v1' } },
      { VERCEL_OIDC_TOKEN: 'oidc-env' },
    );
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

  it('warns when passing a legacy object shape', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    resolveCodexEnv({ openai: {} }, {});
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining(
        'Passing an object to auth options is deprecated',
      ),
    );
    spy.mockRestore();
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

  it('resolves legacy OpenAI-compatible auth to direct auth', () => {
    expect(
      resolveCodexAuthenticationMode(
        { openaiCompatible: {} },
        { AI_GATEWAY_API_KEY: 'gateway-key' },
      ),
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
        environment: {
          CODEX_API_KEY: 'openai-secret',
          OPENAI_BASE_URL: 'https://openai.example/v1',
        },
        sandboxEnvironment: { CODEX_API_KEY: 'sandbox-openai-secret' },
        authenticationMode: 'direct',
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
        environment: { CODEX_API_KEY: 'gateway-secret' },
        sandboxEnvironment: { CODEX_API_KEY: 'sandbox-gateway-secret' },
        authenticationMode: 'ai-gateway',
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
        environment: {},
        sandboxEnvironment: {},
        authenticationMode: 'direct',
      }),
    ).toEqual([]);
  });
});
