import { describe, expect, it, vi } from 'vitest';
import {
  createDeepAgentsRequestTransformations,
  resolveDeepAgentsAuthenticationMode,
  resolveDeepAgentsEnv,
} from './deepagents-auth';

describe('resolveDeepAgentsEnv', () => {
  it('pins explicit anthropic auth', () => {
    const env = resolveDeepAgentsEnv({
      auth: {
        anthropic: { apiKey: 'sk-ant', baseUrl: 'https://example.test' },
      },
      processEnv: {},
    });
    expect(env).toEqual({
      ANTHROPIC_API_KEY: 'sk-ant',
      ANTHROPIC_BASE_URL: 'https://example.test',
    });
  });

  it('passes through an anthropic auth token', () => {
    const env = resolveDeepAgentsEnv({
      auth: { anthropic: { authToken: 'tok' } },
      processEnv: {},
    });
    expect(env).toEqual({ ANTHROPIC_AUTH_TOKEN: 'tok' });
  });

  it('routes through the gateway anthropic endpoint (no /v1 suffix)', () => {
    const env = resolveDeepAgentsEnv({
      auth: { gateway: { apiKey: 'gw-key' } },
      processEnv: {},
    });
    expect(env.AI_GATEWAY_API_KEY).toBe('gw-key');
    expect(env.ANTHROPIC_API_KEY).toBe('gw-key');
    expect(env.ANTHROPIC_BASE_URL).toBe('https://ai-gateway.vercel.sh');
  });

  it('trims a trailing slash from a custom gateway base url', () => {
    const env = resolveDeepAgentsEnv({
      auth: { gateway: { apiKey: 'gw-key', baseUrl: 'https://gw.test/' } },
      processEnv: {},
    });
    expect(env.ANTHROPIC_BASE_URL).toBe('https://gw.test');
  });

  it('prefers explicit anthropic auth over ambient gateway creds', () => {
    const env = resolveDeepAgentsEnv({
      auth: { anthropic: { apiKey: 'sk-ant' } },
      processEnv: { AI_GATEWAY_API_KEY: 'ambient-gw' },
    });
    expect(env).toEqual({ ANTHROPIC_API_KEY: 'sk-ant' });
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

  it('warns when passing a legacy object shape', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    resolveDeepAgentsEnv({
      auth: { anthropic: {} },
      processEnv: {},
    });
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining(
        'Passing an object to auth options is deprecated',
      ),
    );
    spy.mockRestore();
  });
});

describe('resolveDeepAgentsAuthenticationMode', () => {
  it('preserves explicit Anthropic auth despite ambient Gateway credentials', () => {
    expect(
      resolveDeepAgentsAuthenticationMode({
        auth: { anthropic: {} },
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
        environment: {
          ANTHROPIC_API_KEY: 'api-secret',
          ANTHROPIC_BASE_URL: 'https://anthropic.example',
        },
        sandboxEnvironment: { ANTHROPIC_API_KEY: 'sandbox-api-secret' },
        authenticationMode: 'anthropic',
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
        environment: {
          ANTHROPIC_AUTH_TOKEN: 'token-secret',
        },
        sandboxEnvironment: {
          ANTHROPIC_AUTH_TOKEN: 'sandbox-token-secret',
        },
        authenticationMode: 'anthropic',
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
        environment: {
          ANTHROPIC_API_KEY: 'gateway-secret',
          ANTHROPIC_BASE_URL: 'https://gateway.example',
        },
        sandboxEnvironment: {
          ANTHROPIC_API_KEY: 'sandbox-gateway-secret',
        },
        authenticationMode: 'ai-gateway',
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
