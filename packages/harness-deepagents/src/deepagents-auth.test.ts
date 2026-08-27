import { describe, expect, it } from 'vitest';
import {
  createDeepAgentsRequestTransformations,
  resolveDeepAgentsAuthenticationMode,
  resolveDeepAgentsEnv,
} from './deepagents-auth';

describe('resolveDeepAgentsEnv', () => {
  it('pins anthropic auth when selected', () => {
    const env = resolveDeepAgentsEnv({
      auth: 'anthropic',
      processEnv: {
        ANTHROPIC_API_KEY: 'sk-ant',
        ANTHROPIC_BASE_URL: 'https://example.test',
        AI_GATEWAY_API_KEY: 'ambient-gw',
      },
    });
    expect(env).toEqual({
      ANTHROPIC_API_KEY: 'sk-ant',
      ANTHROPIC_BASE_URL: 'https://example.test',
    });
  });

  it('passes through an anthropic auth token', () => {
    const env = resolveDeepAgentsEnv({
      auth: 'anthropic',
      processEnv: { ANTHROPIC_AUTH_TOKEN: 'tok' },
    });
    expect(env).toEqual({ ANTHROPIC_AUTH_TOKEN: 'tok' });
  });

  it('routes through the gateway anthropic endpoint (no /v1 suffix)', () => {
    const env = resolveDeepAgentsEnv({
      auth: 'ai-gateway',
      processEnv: { AI_GATEWAY_API_KEY: 'gw-key' },
    });
    expect(env.AI_GATEWAY_API_KEY).toBe('gw-key');
    expect(env.ANTHROPIC_API_KEY).toBe('gw-key');
    expect(env.ANTHROPIC_BASE_URL).toBe('https://ai-gateway.vercel.sh');
  });

  it('trims a trailing slash from a custom gateway base url', () => {
    const env = resolveDeepAgentsEnv({
      auth: 'ai-gateway',
      processEnv: {
        AI_GATEWAY_API_KEY: 'gw-key',
        AI_GATEWAY_BASE_URL: 'https://gw.test/',
      },
    });
    expect(env.ANTHROPIC_BASE_URL).toBe('https://gw.test');
  });

  it('falls back to ambient gateway env before ambient anthropic creds', () => {
    const env = resolveDeepAgentsEnv({
      processEnv: {
        AI_GATEWAY_API_KEY: 'ambient-gw',
        ANTHROPIC_API_KEY: 'ambient-ant',
      },
    });
    expect(env.AI_GATEWAY_API_KEY).toBe('ambient-gw');
    expect(env.ANTHROPIC_API_KEY).toBe('ambient-gw');
    expect(env.ANTHROPIC_BASE_URL).toBe('https://ai-gateway.vercel.sh');
  });

  it('falls back to ambient OIDC token as the gateway key', () => {
    const env = resolveDeepAgentsEnv({
      processEnv: { VERCEL_OIDC_TOKEN: 'oidc-token' },
    });
    expect(env.AI_GATEWAY_API_KEY).toBe('oidc-token');
  });

  it('falls back to ambient anthropic when no gateway creds exist', () => {
    const env = resolveDeepAgentsEnv({
      processEnv: { ANTHROPIC_API_KEY: 'ambient-ant' },
    });
    expect(env).toEqual({ ANTHROPIC_API_KEY: 'ambient-ant' });
  });

  it('uses a supplied authentication environment instead of ambient credentials', () => {
    const auth = { ANTHROPIC_API_KEY: 'programmatic-anthropic-key' };

    expect(
      resolveDeepAgentsEnv({
        auth,
        processEnv: { AI_GATEWAY_API_KEY: 'ambient-gateway-key' },
      }),
    ).toEqual({ ANTHROPIC_API_KEY: 'programmatic-anthropic-key' });
    expect(
      resolveDeepAgentsAuthenticationMode({
        auth,
        processEnv: { AI_GATEWAY_API_KEY: 'ambient-gateway-key' },
      }),
    ).toBe('anthropic');
  });

  it('rejects nested authentication objects before reading ambient credentials', () => {
    const auth = { anthropic: { apiKey: 'legacy-key' } } as never;

    expect(() =>
      resolveDeepAgentsEnv({
        auth,
        processEnv: { AI_GATEWAY_API_KEY: 'ambient-gateway-key' },
      }),
    ).toThrow(
      'Invalid auth: expected an authentication mode or a flat record with string values.',
    );
    expect(() =>
      resolveDeepAgentsAuthenticationMode({
        auth,
        processEnv: { AI_GATEWAY_API_KEY: 'ambient-gateway-key' },
      }),
    ).toThrow(
      'Invalid auth: expected an authentication mode or a flat record with string values.',
    );
  });

  it('supports string authentication modes', () => {
    expect(
      resolveDeepAgentsEnv({
        auth: 'anthropic',
        processEnv: { ANTHROPIC_API_KEY: 'sk-anthropic' },
      }),
    ).toEqual({ ANTHROPIC_API_KEY: 'sk-anthropic' });

    expect(
      resolveDeepAgentsEnv({
        auth: 'ai-gateway',
        processEnv: { AI_GATEWAY_API_KEY: 'gw-mode' },
      }),
    ).toEqual({
      AI_GATEWAY_API_KEY: 'gw-mode',
      ANTHROPIC_API_KEY: 'gw-mode',
      ANTHROPIC_BASE_URL: 'https://ai-gateway.vercel.sh',
    });
  });
});

describe('resolveDeepAgentsAuthenticationMode', () => {
  it('preserves Anthropic auth despite ambient Gateway credentials', () => {
    expect(
      resolveDeepAgentsAuthenticationMode({
        auth: 'anthropic',
        processEnv: { AI_GATEWAY_API_KEY: 'gateway-key' },
      }),
    ).toBe('anthropic');
  });

  it('resolves ambient Gateway credentials to Gateway auth', () => {
    expect(
      resolveDeepAgentsAuthenticationMode({
        processEnv: { VERCEL_OIDC_TOKEN: 'oidc-token' },
      }),
    ).toBe('ai-gateway');
  });
});

describe('createDeepAgentsRequestTransformations', () => {
  it('injects the Anthropic API key at the configured endpoint', () => {
    expect(
      createDeepAgentsRequestTransformations({
        env: {
          ANTHROPIC_API_KEY: 'api-secret',
          ANTHROPIC_BASE_URL: 'https://anthropic.example',
        },
        sandboxEnv: { ANTHROPIC_API_KEY: 'sandbox-api-secret' },
        auth: 'anthropic',
      }),
    ).toEqual([
      {
        match: {
          host: 'anthropic.example',
          headers: [
            {
              key: { exact: 'x-api-key' },
              value: { exact: 'sandbox-api-secret' },
            },
          ],
        },
        transform: { headers: { 'x-api-key': 'api-secret' } },
      },
    ]);
  });

  it('injects the Anthropic auth token as a bearer credential', () => {
    expect(
      createDeepAgentsRequestTransformations({
        env: {
          ANTHROPIC_AUTH_TOKEN: 'token-secret',
        },
        sandboxEnv: {
          ANTHROPIC_AUTH_TOKEN: 'sandbox-token-secret',
        },
        auth: 'anthropic',
      }),
    ).toEqual([
      {
        match: {
          host: 'api.anthropic.com',
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
      createDeepAgentsRequestTransformations({
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
