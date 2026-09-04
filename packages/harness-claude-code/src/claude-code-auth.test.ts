import { describe, expect, it, vi } from 'vitest';
import {
  createClaudeCodeRequestTransformations,
  resolveClaudeCodeAuthenticationMode,
  resolveClaudeCodeEnv,
} from './claude-code-auth';

const noHelper = () => undefined;

describe('resolveClaudeCodeEnv', () => {
  it('pins direct anthropic auth when selected', () => {
    const env = resolveClaudeCodeEnv(
      'direct',
      { ANTHROPIC_API_KEY: 'sk-direct', AI_GATEWAY_API_KEY: 'gw-key' },
      { readApiKeyHelper: noHelper },
    );
    expect(env).toEqual({ ANTHROPIC_API_KEY: 'sk-direct' });
  });

  it('uses ANTHROPIC_* env in direct mode', () => {
    const env = resolveClaudeCodeEnv(
      'direct',
      {
        ANTHROPIC_API_KEY: 'sk-process',
        ANTHROPIC_BASE_URL: 'https://api.example.com',
      },
      { readApiKeyHelper: noHelper },
    );
    expect(env).toEqual({
      ANTHROPIC_API_KEY: 'sk-process',
      ANTHROPIC_BASE_URL: 'https://api.example.com',
    });
  });

  it('routes through the gateway when gateway mode is selected', () => {
    const env = resolveClaudeCodeEnv(
      'ai-gateway',
      { AI_GATEWAY_API_KEY: 'gw-explicit' },
      { readApiKeyHelper: noHelper },
    );
    expect(env.AI_GATEWAY_API_KEY).toBe('gw-explicit');
    expect(env.ANTHROPIC_API_KEY).toBe('gw-explicit');
    expect(env.ANTHROPIC_BASE_URL).toBe('https://ai-gateway.vercel.sh');
  });

  it('uses gateway auth from the environment', () => {
    const env = resolveClaudeCodeEnv(
      'ai-gateway',
      {
        AI_GATEWAY_BASE_URL: 'https://gw.example',
        VERCEL_OIDC_TOKEN: 'oidc-env',
      },
      { readApiKeyHelper: noHelper },
    );
    expect(env).toEqual({
      AI_GATEWAY_API_KEY: 'oidc-env',
      ANTHROPIC_API_KEY: 'oidc-env',
      AI_GATEWAY_BASE_URL: 'https://gw.example',
      ANTHROPIC_BASE_URL: 'https://gw.example',
    });
  });

  it('auto-detects gateway when AI_GATEWAY_API_KEY is set', () => {
    const env = resolveClaudeCodeEnv(
      undefined,
      { AI_GATEWAY_API_KEY: 'gw-auto' },
      { readApiKeyHelper: noHelper },
    );
    expect(env.AI_GATEWAY_API_KEY).toBe('gw-auto');
    expect(env.ANTHROPIC_API_KEY).toBe('gw-auto');
  });

  it('auto-detects gateway when VERCEL_OIDC_TOKEN is set', () => {
    const env = resolveClaudeCodeEnv(
      undefined,
      { VERCEL_OIDC_TOKEN: 'oidc-auto' },
      { readApiKeyHelper: noHelper },
    );
    expect(env.AI_GATEWAY_API_KEY).toBe('oidc-auto');
    expect(env.ANTHROPIC_API_KEY).toBe('oidc-auto');
    expect(env.AI_GATEWAY_BASE_URL).toBe('https://ai-gateway.vercel.sh');
    expect(env.ANTHROPIC_BASE_URL).toBe('https://ai-gateway.vercel.sh');
  });

  it('auto-detects direct anthropic when only ANTHROPIC_API_KEY is set', () => {
    const env = resolveClaudeCodeEnv(
      undefined,
      { ANTHROPIC_API_KEY: 'sk-auto' },
      { readApiKeyHelper: noHelper },
    );
    expect(env).toEqual({ ANTHROPIC_API_KEY: 'sk-auto' });
  });

  it('uses a supplied authentication environment without ambient or helper fallback', () => {
    const helper = vi.fn(() => 'helper-key');
    const auth = { ANTHROPIC_API_KEY: 'programmatic-anthropic-key' };

    expect(
      resolveClaudeCodeEnv(
        auth,
        { AI_GATEWAY_API_KEY: 'ambient-gateway-key' },
        { readApiKeyHelper: helper },
      ),
    ).toEqual({ ANTHROPIC_API_KEY: 'programmatic-anthropic-key' });
    expect(helper).not.toHaveBeenCalled();
    expect(
      resolveClaudeCodeAuthenticationMode(auth, {
        AI_GATEWAY_API_KEY: 'ambient-gateway-key',
      }),
    ).toBe('direct');
  });

  it('rejects nested authentication objects before reading ambient credentials', () => {
    const auth = { anthropic: { apiKey: 'legacy-key' } } as never;

    expect(() =>
      resolveClaudeCodeEnv(
        auth,
        { AI_GATEWAY_API_KEY: 'ambient-gateway-key' },
        { readApiKeyHelper: noHelper },
      ),
    ).toThrow(
      'Invalid auth: expected an authentication mode or a flat record with string values.',
    );
    expect(() =>
      resolveClaudeCodeAuthenticationMode(auth, {
        AI_GATEWAY_API_KEY: 'ambient-gateway-key',
      }),
    ).toThrow(
      'Invalid auth: expected an authentication mode or a flat record with string values.',
    );
  });

  it('forwards host ANTHROPIC_BASE_URL alongside the api key', () => {
    const env = resolveClaudeCodeEnv(
      undefined,
      {
        ANTHROPIC_API_KEY: 'sk-auto',
        ANTHROPIC_BASE_URL: 'https://ai-gateway.vercel.sh',
      },
      { readApiKeyHelper: noHelper },
    );
    expect(env).toEqual({
      ANTHROPIC_API_KEY: 'sk-auto',
      ANTHROPIC_BASE_URL: 'https://ai-gateway.vercel.sh',
    });
  });

  it('forwards a base URL alongside the apiKeyHelper-supplied credentials', () => {
    const env = resolveClaudeCodeEnv(
      undefined,
      { ANTHROPIC_BASE_URL: 'https://ai-gateway.vercel.sh' },
      { readApiKeyHelper: () => 'vck_from_helper' },
    );
    expect(env).toEqual({
      ANTHROPIC_API_KEY: 'vck_from_helper',
      ANTHROPIC_AUTH_TOKEN: 'vck_from_helper',
      ANTHROPIC_BASE_URL: 'https://ai-gateway.vercel.sh',
    });
  });

  it('populates both ANTHROPIC_API_KEY and ANTHROPIC_AUTH_TOKEN from the apiKeyHelper', () => {
    const env = resolveClaudeCodeEnv(
      undefined,
      {},
      { readApiKeyHelper: () => 'vck_from_helper' },
    );
    expect(env).toEqual({
      ANTHROPIC_API_KEY: 'vck_from_helper',
      ANTHROPIC_AUTH_TOKEN: 'vck_from_helper',
    });
  });

  it('prefers a static ANTHROPIC_API_KEY over the apiKeyHelper', () => {
    const helper = vi.fn(() => 'sk-from-helper');
    const env = resolveClaudeCodeEnv(
      undefined,
      { ANTHROPIC_API_KEY: 'sk-static' },
      { readApiKeyHelper: helper },
    );
    expect(env.ANTHROPIC_API_KEY).toBe('sk-static');
  });

  it('returns an empty env when nothing is configured', () => {
    const env = resolveClaudeCodeEnv(
      undefined,
      {},
      {
        readApiKeyHelper: noHelper,
      },
    );
    expect(env).toEqual({});
  });

  it('supports string authentication modes', () => {
    expect(
      resolveClaudeCodeEnv(
        'direct',
        { ANTHROPIC_API_KEY: 'sk-direct' },
        { readApiKeyHelper: noHelper },
      ),
    ).toEqual({ ANTHROPIC_API_KEY: 'sk-direct' });

    expect(
      resolveClaudeCodeEnv(
        'ai-gateway',
        { AI_GATEWAY_API_KEY: 'gw-mode' },
        { readApiKeyHelper: noHelper },
      ),
    ).toEqual({
      AI_GATEWAY_API_KEY: 'gw-mode',
      ANTHROPIC_API_KEY: 'gw-mode',
      AI_GATEWAY_BASE_URL: 'https://ai-gateway.vercel.sh',
      ANTHROPIC_BASE_URL: 'https://ai-gateway.vercel.sh',
    });
  });
});

describe('resolveClaudeCodeAuthenticationMode', () => {
  it('preserves direct auth despite ambient Gateway credentials', () => {
    expect(
      resolveClaudeCodeAuthenticationMode('direct', {
        AI_GATEWAY_API_KEY: 'gateway-key',
      }),
    ).toBe('direct');
  });

  it('resolves ambient Gateway credentials to Gateway auth', () => {
    expect(
      resolveClaudeCodeAuthenticationMode(undefined, {
        VERCEL_OIDC_TOKEN: 'oidc-token',
      }),
    ).toBe('ai-gateway');
  });
});

describe('createClaudeCodeRequestTransformations', () => {
  it('injects Anthropic API key and auth token headers at the configured endpoint', () => {
    expect(
      createClaudeCodeRequestTransformations({
        env: {
          ANTHROPIC_API_KEY: 'api-secret',
          ANTHROPIC_AUTH_TOKEN: 'token-secret',
          ANTHROPIC_BASE_URL: 'https://anthropic.example/v1',
        },
        sandboxEnv: {
          ANTHROPIC_API_KEY: 'sandbox-api-secret',
          ANTHROPIC_AUTH_TOKEN: 'sandbox-token-secret',
        },
        auth: 'direct',
      }),
    ).toEqual([
      {
        match: {
          host: 'anthropic.example',
          path: { startsWith: '/v1' },
          headers: [
            {
              key: { exact: 'x-api-key' },
              value: { exact: 'sandbox-api-secret' },
            },
          ],
        },
        transform: {
          headers: { 'x-api-key': 'api-secret' },
        },
      },
      {
        match: {
          host: 'anthropic.example',
          path: { startsWith: '/v1' },
          headers: [
            {
              key: { exact: 'Authorization' },
              value: { exact: 'Bearer sandbox-token-secret' },
            },
          ],
        },
        transform: {
          headers: { Authorization: 'Bearer token-secret' },
        },
      },
    ]);
  });

  it('uses the resolved Gateway route', () => {
    expect(
      createClaudeCodeRequestTransformations({
        env: {
          ANTHROPIC_API_KEY: 'gateway-secret',
          ANTHROPIC_BASE_URL: 'https://gateway.example',
        },
        sandboxEnv: {
          ANTHROPIC_API_KEY: 'sandbox-gateway-secret',
        },
        auth: 'ai-gateway',
      }),
    ).toEqual([
      {
        match: {
          host: 'gateway.example',
          headers: [
            {
              key: { exact: 'x-api-key' },
              value: { exact: 'sandbox-gateway-secret' },
            },
          ],
        },
        transform: { headers: { 'x-api-key': 'gateway-secret' } },
      },
    ]);
  });
});
